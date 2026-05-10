import { createClient } from "@/lib/supabase/server";
import { sendBridgeFile } from "@/lib/wa-bridge";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversation_id, attachment_id } = await request.json();
  if (!conversation_id || !attachment_id) {
    return NextResponse.json({ error: "Faltan campos: conversation_id, attachment_id" }, { status: 400 });
  }

  // Obtener conversación
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("wa_chat_id")
    .eq("id", conversation_id)
    .eq("owner_id", user.id)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  // Obtener attachment
  const { data: attachment, error: attachErr } = await supabase
    .from("file_attachments")
    .select("storage_path, file_name, content_type")
    .eq("id", attachment_id)
    .eq("owner_id", user.id)
    .single();

  if (attachErr || !attachment) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  // Descargar el archivo desde Supabase Storage
  const { data: fileData, error: downloadErr } = await supabase.storage
    .from("attachments")
    .download(attachment.storage_path);

  if (downloadErr || !fileData) {
    return NextResponse.json({ error: "Error descargando el archivo" }, { status: 500 });
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = attachment.content_type ?? "application/octet-stream";

  try {
    const sent = await sendBridgeFile(conv.wa_chat_id, base64, mimeType, attachment.file_name);

    const body = `📎 ${attachment.file_name}`;

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        owner_id: user.id,
        conversation_id,
        wa_message_id: sent.wa_message_id,
        direction: "outbound",
        body,
        media_type: mimeType,
        status: "sent",
      })
      .select()
      .single();

    if (msgErr) throw new Error(msgErr.message);

    await supabase
      .from("conversations")
      .update({ last_message: body, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return NextResponse.json(msg, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error enviando archivo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
