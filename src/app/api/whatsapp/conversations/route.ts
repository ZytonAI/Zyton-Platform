import { createClient } from "@/lib/supabase/server";
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  return NextResponse.json(data);
}
