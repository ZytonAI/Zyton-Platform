import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// media_url usa la convención "bucket/path" (ej: "wa-media/uid/conv/msg.jpg"
// o "attachments/uid/leads/id/file.pdf"); separar para firmar en el bucket correcto
function splitBucketPath(mediaUrl: string): { bucket: string; path: string } | null {
  const idx = mediaUrl.indexOf("/");
  if (idx <= 0 || idx === mediaUrl.length - 1) return null;
  return { bucket: mediaUrl.slice(0, idx), path: mediaUrl.slice(idx + 1) };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verificar que la conversación pertenece al usuario
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!conv) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data ?? []).reverse();

  // Firmar URLs de media (1 hora) — el bucket es privado
  const withMedia = messages.filter((m) => m.media_url);
  if (withMedia.length > 0) {
    const admin = createAdminClient();
    await Promise.all(
      withMedia.map(async (msg) => {
        const parts = splitBucketPath(msg.media_url as string);
        if (!parts) return;
        const { data: signed } = await admin.storage
          .from(parts.bucket)
          .createSignedUrl(parts.path, 3600);
        if (signed?.signedUrl) {
          (msg as Record<string, unknown>).media_signed_url = signed.signedUrl;
        }
      })
    );
  }

  // Marcar como leído
  await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", id)
    .eq("owner_id", user.id);

  return NextResponse.json(messages);
}
