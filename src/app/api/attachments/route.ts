import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { entity_type, entity_id, file_name, content_type, size_bytes } = body;

  if (!entity_type || !entity_id || !file_name) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const storage_path = `${user.id}/${entity_type}s/${entity_id}/${Date.now()}_${file_name}`;

  const { data: signedUrl, error: signedError } = await supabase.storage
    .from("attachments")
    .createSignedUploadUrl(storage_path);

  if (signedError) return NextResponse.json({ error: signedError.message }, { status: 500 });

  const { data: attachment, error: dbError } = await supabase
    .from("file_attachments")
    .insert({ owner_id: user.id, entity_type, entity_id, file_name, storage_path, content_type, size_bytes })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ attachment, signedUrl: signedUrl.signedUrl, token: signedUrl.token });
}
