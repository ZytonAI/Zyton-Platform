import { createClient } from "@/lib/supabase/server";
import { clientSchema } from "@/lib/validations/client.schema";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [clientRes, historyRes, attachmentsRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("client_history").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("file_attachments").select("*").eq("entity_type", "client").eq("entity_id", id).order("created_at", { ascending: false }),
  ]);

  if (clientRes.error) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    client: clientRes.data,
    history: historyRes.data ?? [],
    attachments: attachmentsRes.data ?? [],
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = clientSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await supabase.from("clients").select("status").eq("id", id).single();

  const { data, error } = await supabase
    .from("clients")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.status && existing.data?.status !== parsed.data.status) {
    await supabase.from("client_history").insert({
      client_id: id,
      owner_id: user.id,
      event_type: "status_change",
      description: `Estado cambiado de "${existing.data?.status}" a "${parsed.data.status}"`,
      metadata: { from: existing.data?.status, to: parsed.data.status },
    });
  }

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

  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
