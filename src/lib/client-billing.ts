import type { SupabaseClient } from "@supabase/supabase-js";

interface BillingInput {
  billing_type?: "monthly" | "one_time" | null;
  billing_amount?: number | null;
}

/**
 * Crea o sincroniza la factura de cobro (receivable) ligada a un cliente a
 * partir de billing_type/billing_amount. Si ya existe una factura ligada
 * (billing_invoice_id) se actualiza en el lugar en vez de duplicarla, así
 * la recurrencia (que resetea la misma fila al marcarla pagada, ver
 * resetRecurringInvoices) sigue funcionando sobre la misma factura.
 */
export async function syncBillingInvoice(
  supabase: SupabaseClient,
  ownerId: string,
  clientId: string,
  clientName: string,
  contractStart: string | null | undefined,
  input: BillingInput,
  existingInvoiceId: string | null | undefined
): Promise<string | null> {
  if (!input.billing_type) return existingInvoiceId ?? null;

  const isMonthly = input.billing_type === "monthly";
  const fields = {
    title: `Cobro ${isMonthly ? "mensual" : "único"} — ${clientName}`,
    amount: input.billing_amount,
    category: "Cliente",
    type: "receivable" as const,
    is_recurring: isMonthly,
    recurrence_interval: isMonthly ? ("monthly" as const) : null,
    client_id: clientId,
  };

  if (existingInvoiceId) {
    await supabase
      .from("invoices")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", existingInvoiceId);
    return existingInvoiceId;
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .insert({
      ...fields,
      owner_id: ownerId,
      due_date: contractStart || new Date().toISOString().split("T")[0],
      status: "pending",
    })
    .select("id")
    .single();

  return invoice?.id ?? null;
}
