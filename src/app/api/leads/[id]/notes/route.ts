import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const noteSchema = z.object({
  note: z.string().min(1, "La nota no puede estar vacía").max(5000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nota inválida" }, { status: 400 });
  }

  // Verificar que el lead pertenece al usuario
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  const { data, error } = await supabase
    .from("lead_history")
    .insert({
      lead_id: id,
      owner_id: user.id,
      event_type: "note_added",
      description: parsed.data.note.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
