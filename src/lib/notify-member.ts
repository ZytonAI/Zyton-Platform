import { createServiceClient } from "@/lib/supabase/service";
import { memberBySlug } from "@/lib/team";

/**
 * Avisos de "te asignaron algo".
 *
 * Cuando el trabajo era de una sola persona no hacía falta: uno sabía lo que
 * se ponía a sí mismo. Con cuatro, si nadie avisa, la tarea o el lead se
 * quedan esperando a que el asignado entre a mirar por casualidad.
 *
 * Va por Telegram, que es el canal que el equipo ya tiene vinculado (el mismo
 * de Diana y de los recordatorios de facturas). Si la persona no lo vinculó
 * todavía, no pasa nada: el aviso simplemente no sale.
 */
export async function notifyMember(slug: string | null | undefined, text: string): Promise<void> {
  const member = memberBySlug(slug ?? "");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!member || !token) return;

  try {
    // profiles está bajo RLS y esto corre en rutas de servidor: service role
    const db = createServiceClient();
    const { data: profile } = await db
      .from("profiles")
      .select("telegram_chat_id")
      .ilike("username", member.username)
      .maybeSingle();

    const chatId = (profile as { telegram_chat_id?: string | null } | null)?.telegram_chat_id;
    if (!chatId) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch {
    // Un aviso que falla nunca debe tumbar la acción que lo disparó
  }
}

/** Igual, pero sin avisarse a uno mismo cuando se autoasigna algo. */
export async function notifyAssignment(
  targetSlug: string | null | undefined,
  actorSlug: string | null | undefined,
  text: string
): Promise<void> {
  if (!targetSlug || targetSlug === actorSlug) return;
  await notifyMember(targetSlug, text);
}
