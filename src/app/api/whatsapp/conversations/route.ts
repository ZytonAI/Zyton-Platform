import { createClient } from "@/lib/supabase/server";
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
    .eq("owner_id", user.id)
    .order("last_message_at", { ascending: false, nullsFirst: false });

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

  const cleanPhone = phone.replace(/\D/g, "");
  const wa_chat_id = `${cleanPhone}@c.us`;

  const { data, error } = await supabase
    .from("conversations")
    .upsert(
      {
        owner_id: user.id,
        wa_chat_id,
        contact_phone: cleanPhone,
        contact_name: name || null,
        lead_id: lead_id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,wa_chat_id", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
