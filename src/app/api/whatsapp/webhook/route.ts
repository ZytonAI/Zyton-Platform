import { createAdminClient } from "@/lib/supabase/admin";
import { anthropic } from "@/lib/anthropic";
import { sendBridgeMessage } from "@/lib/wa-bridge";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.WA_BRIDGE_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const { wa_chat_id, contact_phone, contact_name, wa_message_id, body, timestamp } = payload;

  if (!wa_chat_id || !body || !wa_message_id) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("wa_sessions")
    .select("owner_id")
    .eq("status", "connected")
    .single();

  if (!session) {
    return NextResponse.json({ error: "No hay sesion WA activa" }, { status: 503 });
  }

  const owner_id = session.owner_id;

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .upsert(
      {
        owner_id,
        wa_chat_id,
        contact_phone,
        contact_name: contact_name ?? null,
        last_message: body,
        last_message_at: timestamp ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,wa_chat_id", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Error guardando conversacion" }, { status: 500 });
  }

  await supabase.rpc("increment_unread", { conversation_id: conv.id });

  const { error: msgErr } = await supabase.from("messages").upsert(
    {
      owner_id,
      conversation_id: conv.id,
      wa_message_id,
      direction: "inbound",
      body,
      status: "delivered",
      created_at: timestamp ?? new Date().toISOString(),
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true }
  );

  if (msgErr) {
    return NextResponse.json({ error: "Error guardando mensaje" }, { status: 500 });
  }

  // Lógica del agente IA
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("owner_id", owner_id)
    .eq("enabled", true)
    .single();

  if (agent) {
    try {
      // Historial reciente de la conversación (últimos 20 mensajes)
      const { data: history } = await supabase
        .from("messages")
        .select("direction, body")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(20);

      const messages = (history ?? []).map((m) => ({
        role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
        content: m.body,
      }));

      const aiRes = await anthropic.messages.create({
        model: agent.model,
        max_tokens: 500,
        system: agent.system_prompt,
        messages,
      });

      const replyText =
        aiRes.content[0].type === "text" ? aiRes.content[0].text.trim() : null;

      if (replyText) {
        const sent = await sendBridgeMessage(wa_chat_id, replyText);

        const newMsgId = sent.wa_message_id ?? `ai-${Date.now()}`;
        await supabase.from("messages").insert({
          owner_id,
          conversation_id: conv.id,
          wa_message_id: newMsgId,
          direction: "outbound",
          body: replyText,
          status: "sent",
        });

        await supabase
          .from("conversations")
          .update({
            last_message: replyText,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.id);
      }
    } catch (err) {
      // El agente falló, pero el mensaje ya fue guardado — no bloqueamos la respuesta
      console.error("[webhook] Error agente IA:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true });
}
