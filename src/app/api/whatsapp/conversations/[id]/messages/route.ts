import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Marcar como leído
  await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", id)
    .eq("owner_id", user.id);

  return NextResponse.json(data ?? []);
}
