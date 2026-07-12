import type { SupabaseClient } from "@supabase/supabase-js";

// Suma un intervalo de recurrencia a una fecha (YYYY-MM-DD), con clamping
// de fin de mes (ej: 31 ene + 1 mes → 28/29 feb, no 3 mar)
export function addInterval(dateStr: string, interval: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const addDays = (days: number) => {
    const date = new Date(Date.UTC(y, m - 1, d + days));
    return date.toISOString().split("T")[0];
  };
  const addMonths = (months: number) => {
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().split("T")[0];
  };
  switch (interval) {
    case "weekly":     return addDays(7);
    case "biweekly":   return addDays(14);
    case "monthly":    return addMonths(1);
    case "bimonthly":  return addMonths(2);
    case "quarterly":  return addMonths(3);
    case "semiannual": return addMonths(6);
    case "annual":     return addMonths(12);
    default:           return addMonths(1);
  }
}

/**
 * Facturas recurrentes ya pagadas cuyo período se cumplió (due_date <= hoy):
 * se reinicia LA MISMA factura a "pending" con la fecha avanzada al
 * siguiente período que caiga en el futuro (si se pagó tarde y se saltaron
 * varios ciclos, avanza los que hagan falta en vez de dejarla con una fecha
 * ya vencida). Si sigue sin pagar, se queda "overdue" recordando la deuda;
 * recién se recicla cuando la marcan pagada.
 *
 * Se llama tanto desde el cron diario (todos los owners) como al cargar la
 * página de Facturas (un owner) para que el cambio se vea al instante y no
 * dependa de esperar a la próxima corrida del cron.
 */
export async function resetRecurringInvoices(
  supabase: SupabaseClient,
  todayStr: string,
  ownerId?: string
): Promise<number> {
  let query = supabase
    .from("invoices")
    .select("id, due_date, recurrence_interval")
    .eq("is_recurring", true)
    .eq("status", "paid")
    .not("recurrence_interval", "is", null)
    .lte("due_date", todayStr)
    .limit(500);

  if (ownerId) query = query.eq("owner_id", ownerId);

  const { data: recurring } = await query;
  if (!recurring?.length) return 0;

  let updated = 0;
  for (const inv of recurring) {
    let nextDue = inv.due_date as string;
    let iterations = 0;
    // Avanzar hasta que quede en el futuro (cubre pagos muy tardíos que
    // se saltaron uno o más ciclos)
    while (nextDue <= todayStr && iterations < 24) {
      nextDue = addInterval(nextDue, inv.recurrence_interval as string);
      iterations++;
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        due_date: nextDue,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id)
      .eq("status", "paid"); // seguridad: solo si sigue "paid" al momento del update
    if (!error) updated++;
  }
  return updated;
}
