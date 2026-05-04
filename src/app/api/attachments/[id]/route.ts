import { createClient } from "@/lib/supabase/server";
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
    .select("storage_path")
    .eq("id", id)
    .single();

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await supabase.storage
    .from("attachments")
    .createSignedUrl(attachment.storage_path, 60);

  if (!data) return NextResponse.json({ error: "Error generando URL" }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: attachment } = await supabase
    .from("file_attachments")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.storage.from("attachments").remove([attachment.storage_path]);
  await supabase.from("file_attachments").delete().eq("id", id);

  return NextResponse.json({ success: true });
}
