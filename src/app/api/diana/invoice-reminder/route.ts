import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Suma un intervalo de recurrencia a una fecha (YYYY-MM-DD), con clamping
// de fin de mes (ej: 31 ene + 1 mes → 28/29 feb, no 3 mar)
function addInterval(dateStr: string, interval: string): string {
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

type ServiceClient = ReturnType<typeof createServiceClient>;

// Facturas recurrentes ya pagadas cuyo período se cumplió (due_date <= hoy):
// se reinicia LA MISMA factura a "pendiente" con la fecha de pago avanzada
// al siguiente período (mensual, quincenal, etc.) — es un pago que se repite
// cada mes, no una factura nueva cada vez. Si sigue sin pagar, se queda
// "overdue" recordando la deuda hasta que la marquen pagada; recién ahí, en
// la siguiente corrida del cron, se recicla al período que sigue.
async function resetRecurringInvoices(supabase: ServiceClient, todayStr: string): Promise<number> {
  const { data: recurring } = await supabase
    .from("invoices")
    .select("id, due_date, recurrence_interval")
    .eq("is_recurring", true)
    .eq("status", "paid")
    .not("recurrence_interval", "is", null)
    .lte("due_date", todayStr)
    .limit(500);

  if (!recurring?.length) return 0;

  let updated = 0;
  for (const inv of recurring) {
    const { error } = await supabase
      .from("invoices")
      .update({
        due_date: addInterval(inv.due_date, inv.recurrence_interval!),
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id)
      .eq("status", "paid"); // seguridad: solo si sigue "paid" al momento del update
    if (!error) updated++;
  }
  return updated;
}

export async function GET(request: Request) {
  // Vercel Cron envía Authorization: Bearer {CRON_SECRET}
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Facturas vencidas hoy o con retraso que no estén pagadas
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = today.toISOString().split("T")[0];

  // 1. Reciclar facturas recurrentes ya pagadas cuyo período se cumplió
  let recurringReset = 0;
  try {
    recurringReset = await resetRecurringInvoices(supabase, todayStr);
  } catch {
    // No romper los recordatorios si el reciclaje falla
  }

  // 2. Persistir pending → overdue para las vencidas (antes solo se calculaba en UI)
  await supabase
    .from("invoices")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .lt("due_date", todayStr);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: true, recurringReset, skipped: "no telegram token" });

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id,title,amount,due_date,status,owner_id")
    .lte("due_date", todayStr)
    .neq("status", "paid")
    .order("due_date", { ascending: true });

  if (!invoices?.length) return NextResponse.json({ ok: true, recurringReset, reminded: 0 });

  // Agrupar por owner_id
  const byOwner = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const list = byOwner.get(inv.owner_id) ?? [];
    list.push(inv);
    byOwner.set(inv.owner_id, list);
  }

  let reminded = 0;

  for (const [ownerId, ownerInvoices] of byOwner) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", ownerId)
      .single();

    if (!profile?.telegram_chat_id) continue;

    const overdueList = ownerInvoices.filter((i) => i.status === "overdue" || i.due_date < todayStr);
    const dueToday = ownerInvoices.filter((i) => i.due_date === todayStr);

    const lines: string[] = ["💰 *Recordatorio de facturas — Diana*\n"];

    if (dueToday.length) {
      lines.push("📅 *Vencen hoy:*");
      for (const inv of dueToday) {
        lines.push(`• ${inv.title} — $${Number(inv.amount).toLocaleString("es-CO")}`);
      }
    }

    if (overdueList.length) {
      if (dueToday.length) lines.push("");
      lines.push("⚠️ *Vencidas sin pagar:*");
      for (const inv of overdueList) {
        const days = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / 86_400_000);
        lines.push(`• ${inv.title} — $${Number(inv.amount).toLocaleString("es-CO")} (hace ${days} días)`);
      }
    }

    lines.push("\nRevisa la sección de Facturas en la plataforma para marcarlas como pagadas.");

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: profile.telegram_chat_id,
        text: lines.join("\n"),
        parse_mode: "Markdown",
      }),
    }).catch(() => {});

    reminded++;
  }

  return NextResponse.json({ ok: true, recurringReset, reminded });
}
