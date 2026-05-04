import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (leadError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.status === "converted") {
    return NextResponse.json({ error: "Lead ya convertido" }, { status: 400 });
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      owner_id: user.id,
      lead_id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      notes: lead.notes,
      status: "active",
    })
    .select()
    .single();

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });

  await supabase.from("leads").update({ status: "converted", updated_at: new Date().toISOString() }).eq("id", id);

  await Promise.all([
    supabase.from("lead_history").insert({
      lead_id: id,
      owner_id: user.id,
      event_type: "converted",
      description: `Convertido a cliente`,
      metadata: { client_id: client.id },
    }),
    supabase.from("client_history").insert({
      client_id: client.id,
      owner_id: user.id,
      event_type: "created",
      description: `Cliente creado desde lead`,
      metadata: { lead_id: id },
    }),
  ]);

  return NextResponse.json({ client });
}
