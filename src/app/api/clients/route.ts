import { createClient } from "@/lib/supabase/server";
import { withColumnFallback } from "@/lib/pg-compat";
import { clientSchema } from "@/lib/validations/client.schema";
import { findDuplicate } from "@/lib/duplicates";
import { syncBillingInvoice, stripBillingFields, hideBilling } from "@/lib/client-billing";
import { getSession } from "@/lib/auth/session";
import { canManageBilling } from "@/lib/permissions";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { user, role } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // El cobro configurado solo lo ve el Dueño
  if (!canManageBilling(role)) {
    return NextResponse.json((data ?? []).map(hideBilling));
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { user, role } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Solo el Dueño configura cobros — al Socio Estratégico se le ignoran
  const input = canManageBilling(role) ? parsed.data : stripBillingFields(parsed.data);

  // Detección de duplicados por teléfono/email (se omite con force: true)
  if (body.force !== true) {
    const duplicate = await findDuplicate(supabase, parsed.data.phone, parsed.data.email);
    if (duplicate) {
      return NextResponse.json({ duplicate_of: duplicate }, { status: 409 });
    }
  }

  const { data, error } = await withColumnFallback(
    { ...input, owner_id: user.id },
    (row) => supabase.from("clients").insert(row).select().single()
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("client_history").insert({
    client_id: data.id,
    owner_id: user.id,
    event_type: "created",
    description: "Cliente creado",
  });

  // Si se configuró un cobro, generar automáticamente su factura de cobro
  if ("billing_type" in input && input.billing_type) {
    const invoiceId = await syncBillingInvoice(
      supabase, user.id, data.id, data.name, input.contract_start, input, null
    );
    if (invoiceId) {
      await supabase.from("clients").update({ billing_invoice_id: invoiceId }).eq("id", data.id);
      data.billing_invoice_id = invoiceId;
    }
  }

  return NextResponse.json(canManageBilling(role) ? data : hideBilling(data), { status: 201 });
}
