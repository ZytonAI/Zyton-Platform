import { createClient } from "@/lib/supabase/server";
import { clientUpdateSchema } from "@/lib/validations/client.schema";
import { syncBillingInvoice } from "@/lib/client-billing";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [clientRes, historyRes, attachmentsRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("client_history").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("file_attachments").select("*").eq("entity_type", "client").eq("entity_id", id).order("created_at", { ascending: false }),
  ]);

  if (clientRes.error) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    client: clientRes.data,
    history: historyRes.data ?? [],
    attachments: attachmentsRes.data ?? [],
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = clientUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await supabase.from("clients").select("status, billing_invoice_id").eq("id", id).single();

  const { data, error } = await supabase
    .from("clients")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.status && existing.data?.status !== parsed.data.status) {
    await supabase.from("client_history").insert({
      client_id: id,
      owner_id: user.id,
      event_type: "status_change",
      description: `Estado cambiado de "${existing.data?.status}" a "${parsed.data.status}"`,
      metadata: { from: existing.data?.status, to: parsed.data.status },
    });
  }

  // Sincronizar la factura de cobro con el tipo/monto de cobro del cliente.
  // Si se desconfigura el cobro (billing_type: null) se desvincula pero la
  // factura ya generada no se borra — sigue visible/editable en Facturas.
  if ("billing_type" in parsed.data) {
    if (parsed.data.billing_type) {
      const invoiceId = await syncBillingInvoice(
        supabase, user.id, id, data.name, data.contract_start, parsed.data, existing.data?.billing_invoice_id
      );
      if (invoiceId && invoiceId !== existing.data?.billing_invoice_id) {
        await supabase.from("clients").update({ billing_invoice_id: invoiceId }).eq("id", id);
        data.billing_invoice_id = invoiceId;
      }
    } else if (existing.data?.billing_invoice_id) {
      await supabase.from("clients").update({ billing_invoice_id: null }).eq("id", id);
      data.billing_invoice_id = null;
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
