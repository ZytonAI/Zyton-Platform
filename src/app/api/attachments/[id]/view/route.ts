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

  const { data: attachment } = await supabase
    .from("file_attachments")
    .select("storage_path, content_type")
    .eq("id", id)
    .single();

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from("attachments")
    .download(attachment.storage_path);

  if (error || !blob) return NextResponse.json({ error: "Error descargando archivo" }, { status: 500 });

  const content = await blob.text();

  return new Response(content, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
