import { createClient } from "@/lib/supabase/server";
import { leadSchema } from "@/lib/validations/lead.schema";
import { findDuplicate } from "@/lib/duplicates";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Detección de duplicados por teléfono/email (se omite con force: true)
  if (body.force !== true) {
    const duplicate = await findDuplicate(supabase, user.id, parsed.data.phone, parsed.data.email);
    if (duplicate) {
      return NextResponse.json({ duplicate_of: duplicate }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...parsed.data, owner_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("lead_history").insert({
    lead_id: data.id,
    owner_id: user.id,
    event_type: "created",
    description: "Lead creado",
  });

  return NextResponse.json(data, { status: 201 });
}
