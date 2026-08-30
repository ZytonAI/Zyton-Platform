import { createClient } from "@/lib/supabase/server";
import { withColumnFallback } from "@/lib/pg-compat";
import { NextResponse } from "next/server";
import { z } from "zod";
import { TEAM_SLUGS } from "@/lib/team";

const patchConversationSchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  // Quién trabaja el chat. Va en la conversación y no solo en el lead porque
  // un número que todavía no es lead también hay que poder repartirlo.
  assigned_to: z.enum(TEAM_SLUGS).nullable().optional(),
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
  const { lead_id, assigned_to } = parsed.data;

  // Solo se toca lo que venga en el cuerpo: asignar el chat no debe
  // desvincularlo de su lead, ni al revés.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("lead_id" in parsed.data) patch.lead_id = lead_id ?? null;
  if ("assigned_to" in parsed.data) patch.assigned_to = assigned_to ?? null;

  const { data, error } = await withColumnFallback(patch, (row) =>
    supabase.from("conversations").update(row).eq("id", id).select().single()
  );

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

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, lead_id")
    .eq("id", id)
    .single();

  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  // Eliminar mensajes y luego la conversación
  await supabase.from("messages").delete().eq("conversation_id", id);
  await supabase.from("conversations").delete().eq("id", id);

  // Borrar el chat borra también la etiqueta de cómo fue el contacto: si no
  // queda rastro de la conversación, no hay contacto que contar en el KPI de
  // la quincena. `contacted_by` se queda — es quién trabaja el lead, y el
  // lead sigue en el CRM.
  if (conv.lead_id) {
    const { error } = await withColumnFallback(
      { contact_type: null, contacted_at: null },
      (row) => supabase.from("leads").update(row).eq("id", conv.lead_id!).select().single()
    );
    // Que no se pueda limpiar la etiqueta no debe hacer fallar el borrado
    if (error) console.error("[chat] no se pudo limpiar la etiqueta del lead:", error.message);
  }

  return NextResponse.json({ success: true });
}
