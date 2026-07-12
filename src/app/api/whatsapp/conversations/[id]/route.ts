import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchConversationSchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchConversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const { lead_id } = parsed.data;

  const { data, error } = await supabase
    .from("conversations")
    .update({ lead_id: lead_id ?? null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verificar que la conversación pertenece al usuario
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  // Eliminar mensajes y luego la conversación
  await supabase.from("messages").delete().eq("conversation_id", id);
  await supabase.from("conversations").delete().eq("id", id);

  return NextResponse.json({ success: true });
}
