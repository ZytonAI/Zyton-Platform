import { createAdminClient } from "@/lib/supabase/admin";
import { phonesMatch } from "@/lib/phone";
import { webhookPayloadSchema } from "@/lib/validations/chat.schema";
import { NextResponse } from "next/server";

// Etiquetas de preview cuando el mensaje trae media sin texto
function mediaLabel(mime: string | undefined): string {
  if (!mime) return "[Archivo]";
  if (mime.startsWith("image/")) return "[Imagen]";
  if (mime.startsWith("audio/")) return "[Audio]";
  if (mime.startsWith("video/")) return "[Video]";
  return "[Documento]";
}

function extFromMime(mime: string | undefined, fileName: string | undefined): string {
  const fromName = fileName?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "application/pdf": "pdf",
  };
  const base = mime?.split(";")[0].trim() ?? "";
  return map[base] ?? "bin";
}

// Los acks solo avanzan: sent → delivered → read; failed siempre gana
const STATUS_RANK: Record<string, number> = { sent: 0, delivered: 1, read: 2, failed: 3 };

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (!process.env.WA_BRIDGE_TOKEN || secret !== process.env.WA_BRIDGE_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = webhookPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }
  const payload = parsed.data;

  const supabase = createAdminClient();

  // ── Resolución del owner: por session_phone si viene, si no la sesión más reciente ──
  let owner_id: string | null = null;

  if (payload.session_phone) {
    const { data: sessions } = await supabase
      .from("wa_sessions")
      .select("owner_id, phone")
      .not("phone", "is", null);
    const match = sessions?.find((s) => phonesMatch(s.phone, payload.session_phone));
    owner_id = match?.owner_id ?? null;
  }

  if (!owner_id) {
    const { data: session } = await supabase
      .from("wa_sessions")
      .select("owner_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    owner_id = session?.owner_id ?? null;
  }

  if (!owner_id) {
    return NextResponse.json({ error: "No hay sesion WA registrada" }, { status: 503 });
  }

  // ── Evento ack: actualizar el estado del mensaje (monotónico) ──
  if (payload.type === "ack") {
    const { data: msg } = await supabase
      .from("messages")
      .select("id, status")
      .eq("wa_message_id", payload.wa_message_id)
      .maybeSingle();

    if (!msg) return NextResponse.json({ ok: true, skipped: true });

    const current = STATUS_RANK[msg.status] ?? 0;
    const incoming = STATUS_RANK[payload.status] ?? 0;
    if (incoming <= current) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await supabase.from("messages").update({ status: payload.status }).eq("id", msg.id);
    return NextResponse.json({ ok: true });
  }

  // ── Evento message ──
  const { wa_chat_id, wa_message_id, contact_phone, contact_name, timestamp } = payload;
  const hasMedia = !!payload.media_base64;
  const body = payload.body?.trim() || "";

  if (!body && !hasMedia) {
    return NextResponse.json({ error: "Mensaje sin contenido" }, { status: 400 });
  }

  // Si el mensaje ya existe, no duplicar
  const { data: existingMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("wa_message_id", wa_message_id)
    .maybeSingle();

  if (existingMsg) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // ── Buscar conversación: exacta por wa_chat_id, luego por teléfono normalizado ──
  let convId: string | null = null;
  let needsCanonicalUpdate = false;

  const { data: exactConv } = await supabase
    .from("conversations")
    .select("id")
    .eq("owner_id", owner_id)
    .eq("wa_chat_id", wa_chat_id)
    .maybeSingle();

  if (exactConv) {
    convId = exactConv.id;
  } else if (contact_phone) {
    const { data: candidates } = await supabase
      .from("conversations")
      .select("id, contact_phone")
      .eq("owner_id", owner_id)
      .order("updated_at", { ascending: false });

    const match = candidates?.find((c) => phonesMatch(c.contact_phone, contact_phone));
    if (match) {
      convId = match.id;
      needsCanonicalUpdate = true;
    }
  }

  // Si no existe, crear nueva conversación e intentar vincular al lead por teléfono
  if (!convId) {
    let leadId: string | null = null;
    if (contact_phone) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, phone")
        .eq("owner_id", owner_id)
        .not("phone", "is", null);
      leadId = leads?.find((l) => phonesMatch(l.phone, contact_phone))?.id ?? null;
    }

    const { data: newConv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        owner_id,
        wa_chat_id,
        contact_phone: contact_phone ?? null,
        contact_name: contact_name ?? null,
        lead_id: leadId,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (convErr || !newConv) {
      return NextResponse.json({ error: "Error guardando conversacion" }, { status: 500 });
    }
    convId = newConv.id;
  }

  // ── Media: decodificar y subir a Storage (bucket privado wa-media) ──
  let media_url: string | null = null;
  let media_type: string | null = null;

  if (hasMedia) {
    const buffer = Buffer.from(payload.media_base64!, "base64");
    // Límite de body de Vercel es 4.5 MB; el bridge capea a ~3 MB crudos
    if (buffer.byteLength > 3.5 * 1024 * 1024) {
      return NextResponse.json({ error: "Media demasiado grande" }, { status: 413 });
    }
    const mime = payload.media_mime?.split(";")[0].trim() || "application/octet-stream";
    const ext = extFromMime(payload.media_mime, payload.media_filename);
    // Sanitizar el id del mensaje para usarlo como nombre de archivo
    const safeId = wa_message_id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${owner_id}/${convId}/${safeId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("wa-media")
      .upload(path, buffer, { contentType: mime, upsert: true });

    if (uploadErr) {
      return NextResponse.json({ error: "Error guardando media" }, { status: 500 });
    }
    // Convención bucket/path para que la ruta de mensajes sepa dónde firmar
    media_url = `wa-media/${path}`;
    media_type = mime;
  }

  const displayBody = body || mediaLabel(media_type ?? undefined);

  // ── Insertar el mensaje PRIMERO; solo si realmente se insertó, tocar contadores ──
  const { data: insertedMsg, error: msgErr } = await supabase
    .from("messages")
    .upsert(
      {
        owner_id,
        conversation_id: convId,
        wa_message_id,
        direction: "inbound",
        body: displayBody,
        media_url,
        media_type,
        status: "delivered",
        created_at: timestamp ?? new Date().toISOString(),
      },
      { onConflict: "wa_message_id", ignoreDuplicates: true }
    )
    .select("id");

  if (msgErr) {
    return NextResponse.json({ error: "Error guardando mensaje" }, { status: 500 });
  }

  const actuallyInserted = (insertedMsg?.length ?? 0) > 0;

  if (actuallyInserted) {
    await supabase.rpc("increment_unread", { conversation_id: convId });
    await supabase
      .from("conversations")
      .update({
        // Al hacer match por teléfono, canonicalizar al formato de WhatsApp (con código de país)
        ...(needsCanonicalUpdate ? { wa_chat_id, contact_phone } : {}),
        contact_name: contact_name ?? undefined,
        last_message: displayBody,
        last_message_at: timestamp ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", convId);
  }

  // Notificar a Diana en Telegram cuando llega un mensaje nuevo
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (telegramToken && actuallyInserted) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", owner_id)
      .single();

    if (profile?.telegram_chat_id) {
      const senderName = contact_name || contact_phone || wa_chat_id;
      const preview = displayBody.length > 150 ? displayBody.slice(0, 150) + "..." : displayBody;
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: profile.telegram_chat_id,
          text: `💬 *${senderName}* te ha respondido:\n\n_${preview}_`,
          parse_mode: "Markdown",
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
