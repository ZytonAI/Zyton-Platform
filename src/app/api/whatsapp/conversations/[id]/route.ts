import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { fetchDirectory } from "@/lib/directory";
import { resolverLeadDeConversacion, sellarContactoDelLead } from "@/lib/lead-contacto";
import { withColumnFallback } from "@/lib/pg-compat";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LEAD_STATUS } from "@/lib/status-config";
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
  const { user, realMember } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conv } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .single();

  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  // ── Antes de borrar, que no se pierda nada ──
  //
  // Borrar el chat es limpiar la bandeja, no deshacer el trabajo: el lead se
  // queda con su estado, su dueño y su etiqueta, y el KPI de la quincena no
  // se mueve. Pero el chat sí guarda cosas que el lead no —cuántos mensajes
  // hubo, cuándo fue el último, a quién estaba asignado— y eso se fotografía
  // aquí (migración 028).
  //
  // Además se sella el contacto si el chat tiene mensajes enviados y el lead
  // todavía figuraba sin contactar: son los chats abiertos antes de que
  // enviar marcara el lead. Sin esto, borrarlos devolvía el lead a "Nuevo" y
  // alguien le volvía a escribir.
  const { data: mensajes } = await supabase
    .from("messages")
    .select("direction, created_at, owner_id")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const todos = mensajes ?? [];
  const enviados = todos.filter((m) => m.direction === "outbound");

  const leadId = await resolverLeadDeConversacion(supabase, conv);
  if (leadId && enviados.length > 0) {
    // Quién escribió de verdad: el autor del primer mensaje que salió. No
    // quien está borrando el chat —limpiar la bandeja no es haber contactado—
    // ni el dueño del chat, que pudo cambiar después.
    const directorio = await fetchDirectory(supabase);
    const autor = directorio[enviados[0].owner_id as string];
    await sellarContactoDelLead(supabase, leadId, autor ?? conv.assigned_to ?? undefined);
  }

  const lead = leadId
    ? (
        await supabase
          .from("leads")
          .select("name, status, contacted_by, contact_type, contacted_at")
          .eq("id", leadId)
          .single()
      ).data
    : null;

  const foto = {
    lead_id: leadId,
    contact_phone: conv.contact_phone ?? null,
    contact_name: conv.contact_name ?? null,
    assigned_to: conv.assigned_to ?? null,
    mensajes_total: todos.length,
    mensajes_enviados: enviados.length,
    mensajes_recibidos: todos.length - enviados.length,
    primer_mensaje: todos[0]?.created_at ?? null,
    ultimo_mensaje: todos[todos.length - 1]?.created_at ?? null,
    lead_status: lead?.status ?? null,
    contacted_by: lead?.contacted_by ?? null,
    contact_type: lead?.contact_type ?? null,
    contacted_at: lead?.contacted_at ?? null,
    borrado_por: user.id,
    borrado_por_slug: realMember?.slug ?? null,
  };

  const { error: fotoErr } = await supabase.from("conversaciones_borradas").insert(foto);

  // Si la foto no se puede guardar, no se borra: el chat es el único sitio
  // donde vive esa historia y perderla es justo lo que se quiere evitar.
  if (fotoErr) {
    console.error("[whatsapp] no se pudo guardar la foto del chat:", fotoErr.message);
    return NextResponse.json(
      {
        error:
          "No se pudo guardar el historial del chat, así que no se borró. " +
          "Falta correr la migración 028 en Supabase.",
      },
      { status: 500 }
    );
  }

  // Y en la ficha del lead, que es donde se mira
  if (leadId) {
    const interesado = lead?.status ? LEAD_STATUS[lead.status as keyof typeof LEAD_STATUS]?.label ?? lead.status : "sin estado";
    await supabase.from("lead_history").insert({
      lead_id: leadId,
      owner_id: user.id,
      event_type: "chat_deleted",
      description:
        `Chat de WhatsApp borrado — ${todos.length} mensajes ` +
        `(${enviados.length} enviados, ${todos.length - enviados.length} recibidos). ` +
        `Quedó como "${interesado}"` +
        (lead?.contact_type ? `, contacto ${lead.contact_type === "frio" ? "en frío" : "con investigación"}` : "") +
        (lead?.contacted_by ? `, por ${lead.contacted_by}` : "") + ".",
      metadata: foto,
    });
  }

  await supabase.from("messages").delete().eq("conversation_id", id);
  await supabase.from("conversations").delete().eq("id", id);

  return NextResponse.json({ success: true });
}
