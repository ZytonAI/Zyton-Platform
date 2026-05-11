import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entity_type = searchParams.get("entity_type");
  const entity_id = searchParams.get("entity_id");

  if (!entity_type || !entity_id) {
    return NextResponse.json({ error: "Faltan entity_type o entity_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("file_attachments")
    .select("id, file_name, storage_path, content_type, size_bytes, created_at")
    .eq("owner_id", user.id)
    .eq("entity_type", entity_type)
    .eq("entity_id", entity_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { entity_type, entity_id, file_name, content_type, size_bytes } = body;

  if (!entity_type || !entity_id || !file_name) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  // Sanitizar el nombre para el path de Storage (sin espacios ni caracteres especiales)
  const safeName = file_name
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quitar acentos
    .replace(/[^a-zA-Z0-9._-]/g, "_")                // reemplazar especiales por _
    .replace(/_+/g, "_");                              // colapsar múltiples _

  const storage_path = `${user.id}/${entity_type}s/${entity_id}/${Date.now()}_${safeName}`;

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
