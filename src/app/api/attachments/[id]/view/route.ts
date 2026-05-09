import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: attachment, error: dbErr } = await supabase
    .from("file_attachments")
    .select("storage_path, content_type, content")
    .eq("id", id)
    .single();

  if (dbErr || !attachment) {
    return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  }

  // Fast path: content stored directly in DB
  if (attachment.content) {
    return new Response(attachment.content as string, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // Fallback: fetch from Supabase Storage (legacy records)
  if (!attachment.storage_path) {
    return NextResponse.json({ error: "Sin contenido disponible" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("attachments")
    .createSignedUrl(attachment.storage_path, 120);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Error generando URL de Storage", detail: signErr?.message }, { status: 500 });
  }

  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) {
    return NextResponse.json({ error: "Archivo no encontrado en Storage" }, { status: 404 });
  }

  const html = await fileRes.text();
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
