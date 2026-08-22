import type { SupabaseClient } from "@supabase/supabase-js";

export interface BillingInput {
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

/**
 * Quita los campos de cobro de un payload de cliente. Se usa cuando quien
 * guarda es Socio Estratégico: no puede ver ni configurar cobros, así que su
 * request nunca debe tocar billing_type/billing_amount (ni siquiera para
 * borrarlos si mandara el body a mano).
 */
export function stripBillingFields<T extends BillingInput>(data: T): T {
  // Las claves salen del objeto, así que `"billing_type" in input` da false y
  // quien lo reciba no sincroniza ninguna factura.
  const rest: BillingInput = { ...data };
  delete rest.billing_type;
  delete rest.billing_amount;
  return rest as T;
}

/**
 * Deja en null el cobro de un cliente antes de mandarlo al navegador de un
 * Socio Estratégico. La fila sí trae los campos desde Postgres (RLS es por
 * fila, no por columna), así que se limpian aquí.
 */
export function hideBilling<T extends Record<string, unknown>>(client: T): T {
  return { ...client, billing_type: null, billing_amount: null, billing_invoice_id: null };
}
