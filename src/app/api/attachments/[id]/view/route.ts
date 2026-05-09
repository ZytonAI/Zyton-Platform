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
    .select("storage_path, content_type")
    .eq("id", id)
    .single();

  if (dbErr || !attachment) {
    return NextResponse.json({ error: "Adjunto no encontrado", detail: dbErr?.message }, { status: 404 });
  }

  const admin = createAdminClient();

  // Create a short-lived signed URL and fetch the content server-side
  const { data: signed, error: signErr } = await admin.storage
    .from("attachments")
    .createSignedUrl(attachment.storage_path, 120);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "No se pudo generar URL", detail: signErr?.message, path: attachment.storage_path },
      { status: 500 }
    );
  }

  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) {
    return NextResponse.json(
      { error: "Error obteniendo archivo", status: fileRes.status, url: signed.signedUrl },
      { status: 500 }
    );
  }

  const html = await fileRes.text();

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
