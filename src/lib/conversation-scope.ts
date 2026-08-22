import type { SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, MemberTag } from "@/types";

/**
 * Quién trabaja cada chat de WhatsApp.
 *
 * Manda la etiqueta propia del chat (`conversations.assigned_to`, la que se
 * elige desde el desplegable del hilo). Si no tiene, la hereda del lead
 * vinculado (`leads.contacted_by`) o, si es un cliente, de `clients.closed_by`:
 * así, al etiquetar un lead como "contactado por Camilo", su chat aparece en la
 * vista de Camilo sin tener que asignar nada más.
 *
 * Un chat sin dueño (número desconocido, o lead sin etiqueta) lo ven los
 * cuatro — si no, un mensaje entrante nuevo no le llegaría a nadie.
 */

/** Fila de conversación con los embeds de PostgREST */
type ConversationRow = Conversation & {
  leads?: { contacted_by: MemberTag } | null;
  clients?: { closed_by: MemberTag } | null;
};

function assignedTo(row: ConversationRow): MemberTag {
  return row.assigned_to ?? row.leads?.contacted_by ?? row.clients?.closed_by ?? null;
}

/** ¿Este chat le toca a esta persona? Los que no tienen dueño le tocan a todos. */
export function isMine(conv: Conversation, slug: string | null | undefined): boolean {
  return conv.assigned_to == null || conv.assigned_to === slug;
}

/**
 * Trae las conversaciones del workspace con la etiqueta de quién las trabaja.
 *
 * Si la migración 018 todavía no se aplicó, el embed falla; en ese caso se
 * reintenta sin él y todos los chats quedan sin dueño (comportamiento previo),
 * en vez de dejar el chat en blanco.
 */
export async function fetchConversations(supabase: SupabaseClient): Promise<Conversation[]> {
  const query = (select: string) =>
    supabase
      .from("conversations")
      .select(select)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500);

  const withTags = await query("*, leads(contacted_by), clients(closed_by)");

  if (withTags.error) {
    const plain = await query("*");
    return ((plain.data ?? []) as unknown as Conversation[]).map((c) => ({
      ...c,
      // Sin la migración 021 la columna no existe y el chat queda sin dueño
      assigned_to: c.assigned_to ?? null,
    }));
  }

  return ((withTags.data ?? []) as unknown as ConversationRow[]).map((row) => {
    // Los embeds no viajan al cliente: solo el slug ya resuelto
    const conv = { ...row, assigned_to: assignedTo(row) };
    delete conv.leads;
    delete conv.clients;
    return conv as Conversation;
  });
}

/** Lo que esta persona tiene permitido ver: el Dueño todo, el resto lo suyo. */
export function scopeConversations(
  conversations: Conversation[],
  slug: string | null | undefined,
  canSeeAll: boolean
): Conversation[] {
  if (canSeeAll) return conversations;
  return conversations.filter((c) => isMine(c, slug));
}
