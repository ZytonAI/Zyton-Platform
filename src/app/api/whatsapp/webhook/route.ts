import { createAdminClient } from "@/lib/supabase/admin";
import { duenoDeConversacion } from "@/lib/conversation-scope";
import { notifyMember } from "@/lib/notify-member";
import { memberBySlug, memberByUsername } from "@/lib/team";
import { phonesMatch } from "@/lib/phone";
import { webhookPayloadSchema } from "@/lib/validations/chat.schema";
import { withColumnFallback } from "@/lib/pg-compat";
import { NextResponse } from "next/server";

// Etiquetas de preview cuando el mensaje trae media sin texto
function mediaLabel(mime: string | undefined): string {
  if (!mime) return "[Archivo]";
  if (mime.startsWith("image/")) return "[Imagen]";
  if (mime.startsWith("audio/")) return "[Audio]";
  if (mime.startsWith("video/")) return "[Video]";
  return "[Documento]";
}

function extFromMime(mime: string | undefined, fileName: string | null | undefined): string {
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

/** Lead del workspace cuyo teléfono coincide con el del chat */
async function buscarLeadPorTelefono(
  supabase: ReturnType<typeof createAdminClient>,
  phone: string
): Promise<string | null> {
  const { data: leads } = await supabase.from("leads").select("id, phone").not("phone", "is", null);
  return leads?.find((l) => phonesMatch(l.phone, phone))?.id ?? null;
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
  // Los que escribe el equipo desde el celular llegan como "outbound"
  const direction = payload.direction ?? "inbound";
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

  // ── Buscar la conversación: por id, por @lid y por teléfono ──
  let convId: string | null = null;
  let needsCanonicalUpdate = false;

  const esLid = wa_chat_id.endsWith("@lid");
  // El chat es del workspace, no de quien lo abrió: aquí NO se filtra por
  // `owner_id`. Filtrarlo era lo que duplicaba las conversaciones — el
  // `owner_id` de un mensaje entrante es el de la sesión de WhatsApp (una
  // sola, la de Samuel), así que el que abría Daniel desde un lead quedaba
  // invisible y el webhook creaba una segunda fila al responder el lead.
  const { data: candidates } = await supabase
    .from("conversations")
    .select("id, wa_chat_id, wa_lid, contact_phone")
    .order("updated_at", { ascending: false });

  // Por orden de certeza: el mismo id, el mismo @lid, el mismo teléfono.
  const porChatId = candidates?.find((c) => c.wa_chat_id === wa_chat_id);
  const porLid = esLid ? candidates?.find((c) => c.wa_lid === wa_chat_id) : undefined;
  const porTelefono = contact_phone
    ? candidates?.find((c) => phonesMatch(c.contact_phone, contact_phone))
    : undefined;

  const existente = porChatId ?? porLid ?? porTelefono;

  if (existente) {
    convId = existente.id;
    // Canonicalizar el id solo cuando lo que llega ES un teléfono. Si llega un
    // @lid no se toca: el chat abierto desde el lead guarda su `<tel>@c.us` y
    // ese es el que la ficha del lead espera encontrar. Para escribirle se usa
    // `wa_lid`, que ya quedó guardado (ver wa-destino.ts).
    needsCanonicalUpdate = !porChatId && !esLid;
  }

  // Si no existe, crear nueva conversación e intentar vincular al lead por teléfono
  if (!convId) {
    // El workspace es compartido: el lead puede haberlo creado cualquiera
    const leadId = contact_phone ? await buscarLeadPorTelefono(supabase, contact_phone) : null;

    const { data: newConv, error: convErr } = await withColumnFallback(
      {
        owner_id,
        wa_chat_id,
        wa_lid: esLid ? wa_chat_id : null,
        contact_phone: contact_phone ?? null,
        contact_name: contact_name ?? null,
        lead_id: leadId,
        updated_at: new Date().toISOString(),
      },
      (row) => supabase.from("conversations").insert(row).select("id").single()
    );

    if (convErr || !newConv) {
      return NextResponse.json({ error: "Error guardando conversacion" }, { status: 500 });
    }
    convId = newConv.id;
  }

  // ── Sanar conversaciones guardadas con un @lid en vez de un teléfono ──
  // WhatsApp identifica los chats nuevos como "…@lid", que no es un número: esas
  // conversaciones quedaron sin teléfono real y por lo tanto sin lead. Ahora que
  // el bridge traduce el @lid, se corrigen solas al llegar el siguiente mensaje.
  if (contact_phone) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", convId)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (conv && !phonesMatch(conv.contact_phone, contact_phone)) {
      patch.contact_phone = contact_phone;
    }
    if (conv && !conv.lead_id) {
      const leadId = await buscarLeadPorTelefono(supabase, contact_phone);
      if (leadId) patch.lead_id = leadId;
    }
    // Quien nos escribe desde un @lid nos está dando el identificador con el
    // que hay que responderle: guardarlo es lo que hace que responder funcione
    // sin tener que resolverlo en cada envío.
    if (esLid && conv && !conv.wa_lid) patch.wa_lid = wa_chat_id;

    if (Object.keys(patch).length > 0) {
      await withColumnFallback(patch, (row) =>
        supabase.from("conversations").update(row).eq("id", convId!).select("id").single()
      );
    }
  }

  // ── ¿Es el eco de algo que acabamos de mandar desde la plataforma? ──
  // WhatsApp no siempre devuelve el id del mensaje recién enviado, así que esa
  // fila quedó guardada sin `wa_message_id`. Si además insertáramos la copia que
  // llega por `message_create`, la respuesta saldría dos veces en el hilo. En vez
  // de eso se le pone el id a la fila que ya existe —que además es la que sabe
  // quién escribió— y así también le llegan los acuses de entregado y leído.
  //
  // Solo se reconcilia con una coincidencia clara (mismo texto, o un archivo
  // contra un archivo): ante la duda se inserta, porque perder un mensaje que
  // alguien escribió desde el celular es peor que repetir una burbuja.
  if (direction === "outbound") {
    const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: pendientes } = await supabase
      .from("messages")
      .select("id, body, media_url")
      .eq("conversation_id", convId)
      .eq("direction", "outbound")
      .is("wa_message_id", null)
      .neq("status", "failed")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(5);

    const propio = body
      ? pendientes?.find((m) => m.body === body)
      : hasMedia
        ? pendientes?.find((m) => m.media_url)
        : undefined;

    if (propio) {
      await supabase.from("messages").update({ wa_message_id }).eq("id", propio.id);
      return NextResponse.json({ ok: true, merged: true });
    }
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
  const { data: insertedMsg, error: msgErr } = await withColumnFallback(
    {
      owner_id,
      conversation_id: convId,
      wa_message_id,
      direction,
      body: displayBody,
      media_url,
      media_type,
      // Lo que sale del celular ya está entregado desde el lado del equipo
      status: direction === "outbound" ? "sent" : "delivered",
      // Lo saliente que llega por aquí se escribió en el celular: no se sabe quién
      from_phone: direction === "outbound",
      created_at: timestamp ?? new Date().toISOString(),
    },
    (row) =>
      supabase
        .from("messages")
        .upsert(row, { onConflict: "wa_message_id", ignoreDuplicates: true })
        .select("id")
  );

  if (msgErr) {
    return NextResponse.json({ error: "Error guardando mensaje" }, { status: 500 });
  }

  const actuallyInserted = (insertedMsg?.length ?? 0) > 0;

  if (actuallyInserted) {
    // Solo lo que entra queda sin leer: lo que escribió el propio equipo, no
    if (direction === "inbound") {
      await supabase.rpc("increment_unread", { conversation_id: convId });
    }
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

  // ── Avisar por Telegram a quien trabaja este chat ──
  //
  // El aviso iba siempre al dueño de la SESIÓN de WhatsApp — el número lo
  // comparten los cuatro — así que las respuestas de los chats de todos
  // sonaban en un solo teléfono y a los socios no les llegaba nada. Ahora va
  // a quien trabaja la conversación, con la misma regla que filtra la lista
  // de chats (src/lib/conversation-scope.ts), y el dueño de la sesión
  // conserva la copia de todo lo que entra.
  //
  // Solo lo entrante: lo que sale también pasa por aquí cuando alguien
  // escribe desde el celular, y avisar "te respondieron" por lo que uno mismo
  // acaba de escribir no tiene sentido.
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (telegramToken && actuallyInserted && direction === "inbound") {
    const senderName = contact_name || contact_phone || wa_chat_id;
    const preview = displayBody.length > 150 ? displayBody.slice(0, 150) + "..." : displayBody;

    const dueno = await duenoDeConversacion(supabase, convId!);

    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id, username")
      .eq("id", owner_id)
      .maybeSingle();

    const sesion = memberByUsername(profile?.username)?.slug ?? null;
    // Si el chat es de quien tiene la sesión, le llega una sola vez: la copia
    const ajeno = dueno !== null && dueno !== sesion;

    // A quien le toca. Un chat sin dueño no le suena a nadie.
    if (ajeno) {
      await notifyMember(dueno, `💬 *${senderName}* te respondió:\n\n_${preview}_`);
    }

    // La copia de todo, para quien tiene la sesión de WhatsApp. Los chats sin
    // dueño van marcados: a nadie más le sonaron, así que son los que hay que
    // repartir.
    if (profile?.telegram_chat_id) {
      const deQuien = ajeno
        ? ` (chat de ${memberBySlug(dueno)?.name ?? dueno})`
        : dueno === null
          ? " (sin asignar)"
          : "";
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: profile.telegram_chat_id,
          text: deQuien
            ? `💬 *${senderName}* respondió${deQuien}:\n\n_${preview}_`
            : `💬 *${senderName}* te ha respondido:\n\n_${preview}_`,
          parse_mode: "Markdown",
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
