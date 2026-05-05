import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// El whatsapp-service llama a este endpoint con cada mensaje entrante
export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.WA_BRIDGE_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const { wa_chat_id, contact_phone, contact_name, wa_message_id, body, timestamp } = payload;

  if (!wa_chat_id || !body || !wa_message_id) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  // Usar service role para poder escribir en nombre del owner correcto
  // En single-tenant: hay un solo usuario. Buscamos la sesión conectada.
  const supabase = createAdminClient();

  // Obtener el owner activo buscando la sesión WA conectada
  const { data: session } = await supabase
    .from("wa_sessions")
    .select("owner_id")
    .eq("status", "connected")
    .single();

  if (!session) {
    return NextResponse.json({ error: "No hay sesión WA activa" }, { status: 503 });
  }

  const owner_id = session.owner_id;

  // Upsert conversación
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
    return NextResponse.json({ error: "Error guardando conversación" }, { status: 500 });
  }

  // Incrementar unread_count
  await supabase.rpc("increment_unread", { conversation_id: conv.id });

  // Insertar mensaje (ignorar duplicados por wa_message_id)
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

  return NextResponse.json({ ok: true });
}
