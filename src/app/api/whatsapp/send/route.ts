import { createClient } from "@/lib/supabase/server";
import { sendBridgeMessage } from "@/lib/wa-bridge";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversation_id, body } = await request.json();
  if (!conversation_id || !body?.trim()) {
    return NextResponse.json({ error: "Faltan campos: conversation_id, body" }, { status: 400 });
  }

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

    // Guardar el mensaje enviado en Supabase
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        owner_id: user.id,
        conversation_id,
        wa_message_id: sent.wa_message_id,
        direction: "outbound",
        body: body.trim(),
        status: "sent",
      })
      .select()
      .single();

    if (msgErr) throw new Error(msgErr.message);

    // Actualizar last_message en la conversación
    await supabase
      .from("conversations")
      .update({ last_message: body.trim(), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return NextResponse.json(msg, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error enviando mensaje";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
