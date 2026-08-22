import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/permissions";
import { fetchConversations, scopeConversations } from "@/lib/conversation-scope";
import { toWaChatId } from "@/lib/phone";
import { NextResponse } from "next/server";
import { z } from "zod";

const createConversationSchema = z.object({
  phone: z.string().min(1, "Falta el teléfono").max(30),
  name: z.string().max(255).nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { user, role, member } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Mismo recorte que en la página: cada quien ve lo suyo, el Dueño todo
  const all = await fetchConversations(supabase);
  return NextResponse.json(scopeConversations(all, member?.slug, isOwner(role)));
}

/**
 * Quien abre el chat de un lead que nadie había contactado queda como
 * `contacted_by`. Así la vista personal de WhatsApp se llena sola, sin que
 * haya que ir a etiquetar el lead a mano.
 */
async function tagLeadContactedBy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
  slug: string | undefined
) {
  if (!slug) return;
  await supabase
    .from("leads")
    .update({ contacted_by: slug })
    .eq("id", leadId)
    .is("contacted_by", null);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { user, member } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createConversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta el teléfono" }, { status: 400 });
  const { phone, name, lead_id } = parsed.data;

  // wa_chat_id canónico (con código de país) para que coincida con el
  // formato que reporta WhatsApp y no se creen conversaciones duplicadas
  const wa_chat_id = toWaChatId(phone);
  const cleanPhone = wa_chat_id.replace("@c.us", "");

  // El chat es del workspace: si ya existe una conversación con ese número
  // —la haya abierto quien la haya abierto— se reutiliza en vez de duplicarla.
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("wa_chat_id", wa_chat_id)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name && !existing.contact_name) patch.contact_name = name;
    if (lead_id && !existing.lead_id)   patch.lead_id = lead_id;

    const { data, error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const linkedLead = lead_id ?? existing.lead_id;
    if (linkedLead) await tagLeadContactedBy(supabase, linkedLead, member?.slug);

    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      owner_id: user.id,
      wa_chat_id,
      contact_phone: cleanPhone,
      contact_name: name || null,
      lead_id: lead_id || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (lead_id) await tagLeadContactedBy(supabase, lead_id, member?.slug);

  return NextResponse.json(data);
}
