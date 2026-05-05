import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  const { phone, name } = await request.json();
  if (!phone) return NextResponse.json({ error: "Falta el teléfono" }, { status: 400 });

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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,wa_chat_id", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
