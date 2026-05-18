import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { processDianaMessage } from "@/lib/diana-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
    caption?: string;
    photo?: { file_id: string; file_size?: number }[];
    voice?: { file_id: string; duration: number; mime_type?: string };
    audio?: { file_id: string; duration: number; mime_type?: string };
  };
}

async function getTelegramFileUrl(fileId: string): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const data = await res.json();
  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

async function transcribeAudioUrl(audioUrl: string, mimeType: string): Promise<string> {
  const audioRes = await fetch(audioUrl);
  const buffer = await audioRes.arrayBuffer();
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "mp3";
  const file = new File([buffer], `audio.${ext}`, { type: mimeType || "audio/ogg" });

  const form = new FormData();
  form.append("file", file);
  form.append("model", "whisper-1");
  form.append("language", "es");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const whisperData = await whisperRes.json();
  return whisperData.text ?? "";
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

export async function POST(request: Request) {
  // Verificar el secret del webhook de Telegram
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update: TelegramUpdate = await request.json().catch(() => ({}));
  const msg = update.message;

  // Ignorar actualizaciones sin contenido reconocible
  if (!msg?.chat?.id) return NextResponse.json({ ok: true });
  const hasContent = msg.text || msg.photo || msg.voice || msg.audio || msg.caption;
  if (!hasContent) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? "";
  const supabase = createServiceClient();

  // Comando /start para vincular la cuenta de Telegram
  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const linkToken = parts[1];

    if (!linkToken) {
      await sendTelegramMessage(
        chatId,
        "Hola, soy *Diana*, la secretaria de ZytonAI 👋\n\nPara vincular tu cuenta, ve a la plataforma y copia el token de vinculación desde tu perfil, luego envíamelo con `/start TU_TOKEN`."
      );
      return NextResponse.json({ ok: true });
    }

    // Buscar usuario por token de vinculación
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_link_token", linkToken)
      .single();

    if (!profile) {
      await sendTelegramMessage(chatId, "Token inválido o expirado. Genera uno nuevo desde la plataforma.");
      return NextResponse.json({ ok: true });
    }

    // Guardar el chat_id y limpiar el token
    await supabase
      .from("profiles")
      .update({ telegram_chat_id: String(chatId), telegram_link_token: null })
      .eq("id", profile.id);

    await sendTelegramMessage(
      chatId,
      "✅ ¡Cuenta vinculada exitosamente! Ahora puedo enviarte notificaciones y puedes hablar conmigo por aquí."
    );
    return NextResponse.json({ ok: true });
  }

  // Para mensajes normales, buscar el usuario por su telegram_chat_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("telegram_chat_id", String(chatId))
    .single();

  if (!profile) {
    await sendTelegramMessage(
      chatId,
      "No encontré tu cuenta vinculada. Usa `/start TU_TOKEN` para vincularla primero."
    );
    return NextResponse.json({ ok: true });
  }

  // Procesar mensaje con Diana
  try {
    const baseUrl = new URL(request.url).origin;
    let reply: string;

    if (msg.photo) {
      // Imagen: obtener URL de Telegram y pasar a Diana con visión
      const largest = msg.photo[msg.photo.length - 1];
      const imageUrl = await getTelegramFileUrl(largest.file_id);
      const caption = msg.caption ?? "¿Qué ves en esta imagen?";
      reply = await processDianaMessage(profile.id, caption, "telegram", supabase, baseUrl, imageUrl);

    } else if (msg.voice || msg.audio) {
      // Audio: transcribir con Whisper y procesar como texto
      const audioObj = msg.voice ?? msg.audio!;
      const audioUrl = await getTelegramFileUrl(audioObj.file_id);
      const mimeType = audioObj.mime_type ?? "audio/ogg";
      const transcript = await transcribeAudioUrl(audioUrl, mimeType);
      if (!transcript) {
        await sendTelegramMessage(chatId, "No pude entender el audio. ¿Puedes escribirlo?");
        return NextResponse.json({ ok: true });
      }
      // Mostrar el transcript al usuario antes de responder
      await sendTelegramMessage(chatId, `🎤 _"${transcript}"_`);
      reply = await processDianaMessage(profile.id, transcript, "telegram", supabase, baseUrl);

    } else {
      // Texto normal
      reply = await processDianaMessage(profile.id, text, "telegram", supabase, baseUrl);
    }

    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error("[diana/telegram] Error:", err);
    await sendTelegramMessage(chatId, "Tuve un problema procesando tu mensaje. Inténtalo de nuevo.");
  }

  return NextResponse.json({ ok: true });
}
