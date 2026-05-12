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

  // Si el bridge ya guardó este mensaje directamente en Supabase, no duplicar
  const { data: existingMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("wa_message_id", wa_message_id)
    .maybeSingle();

  if (existingMsg) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Buscar conversación con sufijo de teléfono (maneja códigos de país faltantes)
  let convId: string | null = null;
  const phoneSuffix = contact_phone?.slice(-10);

  const { data: exactConv } = await supabase
    .from("conversations")
    .select("id")
    .eq("owner_id", owner_id)
    .eq("wa_chat_id", wa_chat_id)
    .maybeSingle();

  if (exactConv) {
    convId = exactConv.id;
    await supabase
      .from("conversations")
      .update({
        contact_name: contact_name ?? undefined,
        last_message: body,
        last_message_at: timestamp ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", convId);
  } else if (phoneSuffix) {
    const { data: suffixConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("owner_id", owner_id)
      .like("contact_phone", `%${phoneSuffix}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (suffixConv) {
      convId = suffixConv.id;
      await supabase
        .from("conversations")
        .update({
          wa_chat_id,
          contact_phone,
          contact_name: contact_name ?? undefined,
          last_message: body,
          last_message_at: timestamp ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", convId);
    }
  }

  if (!convId) {
    const { data: newConv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        owner_id,
        wa_chat_id,
        contact_phone,
        contact_name: contact_name ?? null,
        last_message: body,
        last_message_at: timestamp ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (convErr || !newConv) {
      return NextResponse.json({ error: "Error guardando conversacion" }, { status: 500 });
    }
    convId = newConv.id;
  }

  await supabase.rpc("increment_unread", { conversation_id: convId });

  const { error: msgErr } = await supabase.from("messages").upsert(
    {
      owner_id,
      conversation_id: convId,
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
