import { createClient } from "@/lib/supabase/server";
import { sendBridgeMessage } from "@/lib/wa-bridge";
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
    .eq("owner_id", user.id)
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
    };

    const { data: msg, error: msgErr } = retry_message_id
      ? await supabase
          .from("messages")
          .update({ wa_message_id: messageRow.wa_message_id, status: "sent" })
          .eq("id", retry_message_id)
          .eq("owner_id", user.id)
          .select()
          .single()
      : await supabase.from("messages").insert(messageRow).select().single();

    if (msgErr) throw new Error(msgErr.message);

    // Actualizar last_message en la conversación
    await supabase
      .from("conversations")
      .update({ last_message: body.trim(), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return NextResponse.json(msg, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error enviando mensaje";

    // Persistir el intento como "failed" para que no desaparezca de la UI
    // y el usuario pueda reintentar desde la burbuja
    let failedMsg = null;
    if (retry_message_id) {
      const { data } = await supabase
        .from("messages")
        .update({ status: "failed" })
        .eq("id", retry_message_id)
        .eq("owner_id", user.id)
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
