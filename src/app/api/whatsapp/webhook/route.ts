import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.WA_BRIDGE_TOKEN) {
    console.error("[webhook] Token invalido:", secret?.slice(0, 8));
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  console.log("[webhook] Payload:", JSON.stringify(payload).slice(0, 200));
  const { wa_chat_id, contact_phone, contact_name, wa_message_id, body, timestamp } = payload;

  if (!wa_chat_id || !body || !wa_message_id) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: session, error: sessionErr } = await supabase
    .from("wa_sessions")
    .select("owner_id")
    .eq("status", "connected")
    .single();

  if (!session) {
    console.error("[webhook] Sin sesion conectada:", sessionErr?.message);
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
    console.error("[webhook] Error upsert conversation:", convErr?.message);
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
    console.error("[webhook] Error insertando mensaje:", msgErr.message);
    return NextResponse.json({ error: "Error guardando mensaje" }, { status: 500 });
  }

  console.log("[webhook] Mensaje guardado OK:", wa_message_id);
  return NextResponse.json({ ok: true });
}
