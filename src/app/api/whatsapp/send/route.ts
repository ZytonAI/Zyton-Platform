import { createClient } from "@/lib/supabase/server";
import { withColumnFallback } from "@/lib/pg-compat";
import { mensajeDeErrorLegible, sendBridgeMessage } from "@/lib/wa-bridge";
import { sendMessageSchema } from "@/lib/validations/chat.schema";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = sendMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.body.trim()) {
    return NextResponse.json({ error: "Faltan campos: conversation_id, body" }, { status: 400 });
  }
  const { conversation_id, body, retry_message_id } = parsed.data;

  // Obtener la conversación
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("wa_chat_id")
    .eq("id", conversation_id)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  try {
    const sent = await sendBridgeMessage(conv.wa_chat_id, body.trim());

    // Guardar el mensaje enviado (o actualizar la fila fallida en un reintento)
    const messageRow = {
      owner_id: user.id,
      conversation_id,
      wa_message_id: sent.wa_message_id || null,
      direction: "outbound" as const,
      body: body.trim(),
      status: "sent" as const,
      // Escrito desde la plataforma: aquí sí sabemos quién fue (owner_id)
      from_phone: false,
    };

    // WhatsApp no siempre devuelve el id del mensaje que acaba de mandar. Cuando
    // pasa, el eco de `message_create` puede haberse guardado ya como si lo
    // hubieran escrito desde el celular. Se adopta esa fila —poniéndole el autor
    // real— en vez de insertar otra: si no, la respuesta salía dos veces.
    let adoptado: string | null = null;
    if (!messageRow.wa_message_id) {
      const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: eco } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation_id)
        .eq("direction", "outbound")
        .eq("from_phone", true)
        .eq("body", body.trim())
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      adoptado = eco?.id ?? null;
    }

    const { data: msg, error: msgErr } = retry_message_id
      ? await supabase
          .from("messages")
          .update({ wa_message_id: messageRow.wa_message_id, status: "sent" })
          .eq("id", retry_message_id)
          .select()
          .single()
      : adoptado
      // El eco ya está en el hilo: solo hay que decir quién lo escribió (el
      // estado no se toca, que puede venir ya entregado o leído).
      ? await withColumnFallback({ owner_id: user.id, from_phone: false }, (row) =>
          supabase.from("messages").update(row).eq("id", adoptado!).select().single()
        )
      // upsert y no insert: el evento message_create del bridge puede haber
      // guardado este mismo mensaje primero. Gana esta fila, que sí sabe quién
      // lo mandó.
      : await withColumnFallback(messageRow, (row) =>
          supabase
            .from("messages")
            .upsert(row, { onConflict: "wa_message_id" })
            .select()
            .single()
        );

    if (msgErr) throw new Error(msgErr.message);

    // Actualizar last_message en la conversación
    await supabase
      .from("conversations")
      .update({ last_message: body.trim(), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return NextResponse.json(msg, { status: 201 });
  } catch (err) {
    const crudo = err instanceof Error ? err.message : "Error enviando mensaje";
    console.error("[whatsapp] fallo al enviar:", crudo);
    const message = mensajeDeErrorLegible(crudo);

    // Persistir el intento como "failed" para que no desaparezca de la UI
    // y el usuario pueda reintentar desde la burbuja
    let failedMsg = null;
    if (retry_message_id) {
      const { data } = await supabase
        .from("messages")
        .update({ status: "failed" })
        .eq("id", retry_message_id)
        .select()
        .single();
      failedMsg = data;
    } else {
      const { data } = await supabase
        .from("messages")
        .insert({
          owner_id: user.id,
          conversation_id,
          wa_message_id: null,
          direction: "outbound",
          body: body.trim(),
          status: "failed",
        })
        .select()
        .single();
      failedMsg = data;
    }

    return NextResponse.json({ error: message, message: failedMsg }, { status: 500 });
  }
}
