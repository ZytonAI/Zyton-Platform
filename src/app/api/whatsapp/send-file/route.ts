import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withColumnFallback } from "@/lib/pg-compat";
import { destinoDe, mensajeDeErrorLegible, sendBridgeFile } from "@/lib/wa-bridge";
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
    .select("*")
    .eq("id", conversation_id)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  // Obtener attachment — incluye content (HTML guardado en DB) y storage_path
  const { data: attachment, error: attachErr } = await supabase
    .from("file_attachments")
    .select("storage_path, file_name, content_type, content")
    .eq("id", attachment_id)
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

  const body = `📎 ${fileName}`;
  // media_type real del archivo (los HTML se convierten a PDF en el bridge);
  // media_url con convención bucket/path para que el hilo pueda renderizarlo
  const sentMediaType = isHtml ? "application/pdf" : (attachment.content_type ?? "application/octet-stream");
  const sentMediaUrl = isHtml || !attachment.storage_path ? null : `attachments/${attachment.storage_path}`;

  try {
    const sent = await sendBridgeFile(destinoDe(conv), base64, mimeType, fileName);

    // Igual que en /send: cuando WhatsApp no devuelve el id del envío, el eco
    // del celular puede haber guardado ya este archivo. Se adopta esa fila
    // —con el archivo bueno y su autor— en vez de repetir la burbuja.
    let adoptado: string | null = null;
    if (!sent.wa_message_id) {
      const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: eco } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation_id)
        .eq("direction", "outbound")
        .eq("from_phone", true)
        .not("media_url", "is", null)
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      adoptado = eco?.id ?? null;
    }

    const messageRow = {
      owner_id: user.id,
      conversation_id,
      wa_message_id: sent.wa_message_id || null,
      direction: "outbound" as const,
      body,
      media_url: sentMediaUrl,
      media_type: sentMediaType,
      status: "sent" as const,
      from_phone: false,
    };

    const { data: msg, error: msgErr } = adoptado
      ? await withColumnFallback(
          { owner_id: user.id, from_phone: false, body, media_url: sentMediaUrl, media_type: sentMediaType },
          (row) => supabase.from("messages").update(row).eq("id", adoptado!).select().single()
        )
      : await withColumnFallback(messageRow, (row) =>
          supabase.from("messages").insert(row).select().single()
        );

    if (msgErr) throw new Error(msgErr.message);

    await supabase
      .from("conversations")
      .update({ last_message: body, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return NextResponse.json(msg, { status: 201 });
  } catch (err) {
    const crudo = err instanceof Error ? err.message : "Error enviando archivo";
    console.error("[whatsapp] fallo al enviar archivo:", crudo);
    const message = mensajeDeErrorLegible(crudo);

    // Persistir el intento como "failed" para que no desaparezca de la UI
    const { data: failedMsg } = await supabase
      .from("messages")
      .insert({
        owner_id: user.id,
        conversation_id,
        wa_message_id: null,
        direction: "outbound",
        body,
        media_url: sentMediaUrl,
        media_type: sentMediaType,
        status: "failed",
      })
      .select()
      .single();

    return NextResponse.json({ error: message, message: failedMsg }, { status: 500 });
  }
}
