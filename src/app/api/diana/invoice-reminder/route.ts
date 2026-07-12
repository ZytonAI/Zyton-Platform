import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resetRecurringInvoices } from "@/lib/recurring-invoices";

export const dynamic = "force-dynamic";

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
  //    (red de seguridad diaria — lo mismo corre en tiempo real al cargar
  //    la página de Facturas, ver src/lib/recurring-invoices.ts)
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
