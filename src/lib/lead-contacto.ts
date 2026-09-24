import { phonesMatch } from "@/lib/phone";
import { withColumnFallback } from "@/lib/pg-compat";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cuándo un lead queda "contactado", y quién se lo apunta.
 *
 * La regla: **se contacta al enviar el primer mensaje**. Abrir el chat para
 * leer lo que se habló no es contactar a nadie; escribirle sí.
 *
 * Antes esto no lo hacía nadie. `tagLeadContactedBy` (abrir el chat) solo
 * escribía el dueño cuando `contacted_by` estaba vacío, y Raúl inserta sus
 * leads con el dueño ya puesto — así que con 307 de los 322 leads no hacía
 * nada. Enviar un mensaje no tocaba el lead en absoluto. El resultado era un
 * lead al que se le había escrito y seguía saliendo como "Nuevo", así que
 * alguien le volvía a escribir; y si además se borraba el chat, desaparecía
 * el único rastro de que se había contactado.
 *
 * `contacted_at` no se escribe desde aquí: la sella el trigger de la base
 * (migraciones 022, 023, 025 y 028), que es lo que garantiza que la fecha y
 * la etiqueta digan siempre lo mismo, entre por donde entre el cambio.
 */

/** Lo mínimo que hace falta saber de una conversación para casarla con su lead. */
export interface ConversacionParaLead {
  id: string;
  lead_id?: string | null;
  contact_phone?: string | null;
}

/**
 * El lead de una conversación. Si no viene vinculado se busca por teléfono y,
 * si aparece, se deja vinculado para la próxima — es la misma regla que ya
 * usa el chat en el navegador (`resolverLeadId` en MessageThread), pero del
 * lado del servidor, que es donde hace falta cuando se envía o se borra.
 */
export async function resolverLeadDeConversacion(
  supabase: SupabaseClient,
  conv: ConversacionParaLead
): Promise<string | null> {
  if (conv.lead_id) return conv.lead_id;
  if (!conv.contact_phone) return null;

  // Se comparan los últimos dígitos: el chat guarda el número con indicativo
  // y la ficha del lead casi nunca.
  const { data: candidatos } = await supabase
    .from("leads")
    .select("id, phone")
    .not("phone", "is", null)
    .limit(5000);

  const match = (candidatos ?? []).find((l: { phone: string | null }) =>
    phonesMatch(l.phone, conv.contact_phone)
  ) as { id: string } | undefined;

  if (!match) return null;

  // Que la próxima no tenga que adivinar
  await supabase
    .from("conversations")
    .update({ lead_id: match.id })
    .eq("id", conv.id)
    .is("lead_id", null);

  return match.id;
}

export interface ResultadoSellado {
  /** Lo que de verdad cambió en el lead, para poder contarlo o registrarlo */
  cambios: Record<string, unknown>;
  /** Cómo quedó el lead después */
  lead: Record<string, unknown> | null;
}

/**
 * Deja constancia en el lead de que se le escribió.
 *
 *   · `status`       'new' → 'contacted'. Los demás estados no se tocan: uno
 *                    en seguimiento, programado o perdido ya pasó de ahí, y
 *                    escribirle otra vez no lo devuelve atrás.
 *   · `contacted_by` se pone si estaba vacío. Si el lead ya es de alguien, no
 *                    se le quita: escribirle no es quedárselo.
 *   · `contact_type` 'frio' si no tenía etiqueta. La meta son 50 en frío y 5
 *                    con investigación, así que en frío es el caso normal;
 *                    quien investigó el negocio lo cambia desde el chat o la
 *                    ficha y la fecha original no se mueve. Sin esto el KPI
 *                    enseñaba como "sin etiquetar · no cuentan" trabajo que
 *                    sí se hizo.
 *
 * Si no hay nada que cambiar no se escribe: así reenviar mensajes a un lead
 * que ya estaba contactado no le mueve la fecha ni dispara avisos.
 */
export async function sellarContactoDelLead(
  supabase: SupabaseClient,
  leadId: string,
  slug: string | undefined
): Promise<ResultadoSellado> {
  const { data: lead } = await supabase
    .from("leads")
    .select("status, contacted_by, contact_type, contacted_at")
    .eq("id", leadId)
    .single();

  if (!lead) return { cambios: {}, lead: null };

  const cambios: Record<string, unknown> = {};
  if (lead.status === "new") cambios.status = "contacted";
  if (!lead.contacted_by && slug) cambios.contacted_by = slug;
  if (!lead.contact_type) cambios.contact_type = "frio";

  if (Object.keys(cambios).length === 0) return { cambios, lead };

  // `updated_at` se mueve como en cualquier otro guardado: la ficha abierta de
  // alguien más tiene que enterarse de que esto cambió (src/lib/concurrency.ts).
  const { data } = await withColumnFallback(
    { ...cambios, updated_at: new Date().toISOString() },
    (row) => supabase.from("leads").update(row).eq("id", leadId).select().single()
  );

  return { cambios, lead: data ?? lead };
}

/**
 * Lo de arriba, pero partiendo de la conversación. Es lo que llaman las rutas
 * de envío: si el chat no tiene lead detrás no pasa nada — un número suelto
 * que todavía no es lead no tiene dónde apuntarse el contacto.
 *
 * Nunca tumba el envío: el mensaje ya salió, y fallar aquí no puede volverlo
 * a meter en el teléfono.
 */
export async function sellarContactoAlEnviar(
  supabase: SupabaseClient,
  conv: ConversacionParaLead,
  slug: string | undefined
): Promise<void> {
  try {
    const leadId = await resolverLeadDeConversacion(supabase, conv);
    if (!leadId) return;
    await sellarContactoDelLead(supabase, leadId, slug);
  } catch (err) {
    console.error("[lead-contacto] no se pudo sellar el contacto:", err);
  }
}
