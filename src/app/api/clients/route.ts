import { createClient } from "@/lib/supabase/server";
import { clientSchema } from "@/lib/validations/client.schema";
import { findDuplicate } from "@/lib/duplicates";
import { syncBillingInvoice } from "@/lib/client-billing";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Detección de duplicados por teléfono/email (se omite con force: true)
  if (body.force !== true) {
    const duplicate = await findDuplicate(supabase, user.id, parsed.data.phone, parsed.data.email);
    if (duplicate) {
      return NextResponse.json({ duplicate_of: duplicate }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.data, owner_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("client_history").insert({
    client_id: data.id,
    owner_id: user.id,
    event_type: "created",
    description: "Cliente creado",
  });

  // Si se configuró un cobro, generar automáticamente su factura de cobro
  if (parsed.data.billing_type) {
    const invoiceId = await syncBillingInvoice(
      supabase, user.id, data.id, data.name, parsed.data.contract_start, parsed.data, null
    );
    if (invoiceId) {
      await supabase.from("clients").update({ billing_invoice_id: invoiceId }).eq("id", data.id);
      data.billing_invoice_id = invoiceId;
    }
  }

  return NextResponse.json(data, { status: 201 });
}
