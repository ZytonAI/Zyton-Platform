import { createAdminClient } from "@/lib/supabase/admin";
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

  // Buscar la sesión más reciente sin requerir status="connected"
  // El status puede estar momentáneamente desfasado durante reconexiones
  const { data: session } = await supabase
    .from("wa_sessions")
    .select("owner_id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!session) {
    return NextResponse.json({ error: "No hay sesion WA registrada" }, { status: 503 });
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

  return NextResponse.json({ ok: true });
}
