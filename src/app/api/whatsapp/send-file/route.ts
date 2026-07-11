import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendBridgeFile } from "@/lib/wa-bridge";
import { sendFileSchema } from "@/lib/validations/chat.schema";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = sendFileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Faltan campos: conversation_id, attachment_id" }, { status: 400 });
  }
  const { conversation_id, attachment_id } = parsed.data;

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

  // Obtener attachment — incluye content (HTML guardado en DB) y storage_path
  const { data: attachment, error: attachErr } = await supabase
    .from("file_attachments")
    .select("storage_path, file_name, content_type, content")
    .eq("id", attachment_id)
    .eq("owner_id", user.id)
    .single();

  if (attachErr || !attachment) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  let base64: string;
  let mimeType: string;
  let fileName = attachment.file_name;

  const isHtml =
    attachment.content_type === "text/html" ||
    attachment.file_name.toLowerCase().endsWith(".html") ||
    !!attachment.content;

  if (isHtml) {
    // El informe está guardado como HTML (en columna content o en Storage)
    let htmlContent: string;

    if (attachment.content) {
      htmlContent = attachment.content as string;
    } else {
      // Fallback: descargar desde Storage con admin client (evita RLS)
      const admin = createAdminClient();
      const { data: signed } = await admin.storage
        .from("attachments")
        .createSignedUrl(attachment.storage_path, 60);

      if (!signed?.signedUrl) {
        return NextResponse.json({ error: "Error generando URL del archivo" }, { status: 500 });
      }
      const fileRes = await fetch(signed.signedUrl);
      if (!fileRes.ok) {
        return NextResponse.json({ error: "Archivo no encontrado en Storage" }, { status: 500 });
      }
      htmlContent = await fileRes.text();
    }

    // Pasar el HTML al bridge — el bridge lo convierte a PDF con Puppeteer
    base64 = Buffer.from(htmlContent).toString("base64");
    mimeType = "text/html";
    // El bridge renombrará el archivo con extensión .pdf
    fileName = fileName.replace(/\.html?$/i, ".pdf");
    if (!fileName.endsWith(".pdf")) fileName += ".pdf";
  } else {
    // Archivo binario normal (PDF real, imagen, etc.) — descargar desde Storage
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("attachments")
      .createSignedUrl(attachment.storage_path, 60);

    if (!signed?.signedUrl) {
      return NextResponse.json({ error: "Error generando URL del archivo" }, { status: 500 });
    }
    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: "Archivo no encontrado en Storage" }, { status: 500 });
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    base64 = Buffer.from(arrayBuffer).toString("base64");
    mimeType = attachment.content_type ?? "application/octet-stream";
  }

  try {
    const sent = await sendBridgeFile(conv.wa_chat_id, base64, mimeType, fileName);

    const body = `📎 ${fileName}`;

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        owner_id: user.id,
        conversation_id,
        wa_message_id: sent.wa_message_id,
        direction: "outbound",
        body,
        media_type: "application/pdf",
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
