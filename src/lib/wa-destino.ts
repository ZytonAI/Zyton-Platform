import type { SupabaseClient } from "@supabase/supabase-js";
import { withColumnFallback } from "@/lib/pg-compat";
import { destinoDe, resolveBridgeDestination } from "@/lib/wa-bridge";

export interface ConversacionDestino {
  id: string;
  wa_chat_id: string;
  wa_lid?: string | null;
}

/**
 * A qué identificador hay que mandarle el mensaje de una conversación.
 *
 * Las conversaciones que nacieron en el CRM (el botón "Contactar" de un lead)
 * se guardaron con `<telefono>@c.us`, que es lo que WhatsApp ya no acepta en
 * una cuenta migrada. Aquí se le pregunta al bridge por su `@lid` la primera
 * vez y se guarda, así que el costo es de un solo envío por chat.
 *
 * Si el bridge no contesta se sigue con el `wa_chat_id` de siempre: el propio
 * bridge vuelve a intentar resolverlo al enviar, así que no se pierde nada.
 */
export async function resolverDestinoConversacion(
  supabase: SupabaseClient,
  conv: ConversacionDestino
): Promise<{ destino: string; sinWhatsapp: boolean }> {
  if (conv.wa_lid) return { destino: conv.wa_lid, sinWhatsapp: false };

  const resuelto = await resolveBridgeDestination(conv.wa_chat_id);
  if (!resuelto) return { destino: destinoDe(conv), sinWhatsapp: false };

  // No tiene WhatsApp: mejor decirlo que mandar algo que va a fallar
  if (resuelto.existe === false) {
    return { destino: destinoDe(conv), sinWhatsapp: true };
  }

  if (resuelto.lid) {
    // Que no se pueda guardar no debe impedir el envío: ya tenemos el destino
    const { error } = await withColumnFallback({ wa_lid: resuelto.lid }, (row) =>
      supabase.from("conversations").update(row).eq("id", conv.id).select("id").single()
    );
    if (error) console.error("[whatsapp] no se pudo guardar el wa_lid:", error.message);
    return { destino: resuelto.lid, sinWhatsapp: false };
  }

  return { destino: resuelto.destino || destinoDe(conv), sinWhatsapp: false };
}
