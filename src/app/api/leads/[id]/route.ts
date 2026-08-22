import { createClient } from "@/lib/supabase/server";
import { withColumnFallback } from "@/lib/pg-compat";
import { detectConflict } from "@/lib/concurrency";
import { getSession } from "@/lib/auth/session";
import { notifyAssignment } from "@/lib/notify-member";
import { leadSchema } from "@/lib/validations/lead.schema";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [leadRes, historyRes, attachmentsRes] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    supabase.from("lead_history").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("file_attachments").select("*").eq("entity_type", "lead").eq("entity_id", id).order("created_at", { ascending: false }),
  ]);

  if (leadRes.error) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    lead: leadRes.data,
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
  const { user, member } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // Si alguien más guardó mientras esta ficha estaba abierta, no se pisa
  const conflict = await detectConflict(supabase, "leads", id, body.expected_updated_at);
  if (conflict) return conflict;
  const parsed = leadSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await supabase
    .from("leads")
    .select("status, name, contacted_by, closed_by, scheduled_by")
    .eq("id", id)
    .single();

  const { data, error } = await withColumnFallback(
    { ...parsed.data, updated_at: new Date().toISOString() },
    (row) => supabase.from("leads").update(row).eq("id", id).select().single()
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.status && existing.data?.status !== parsed.data.status) {
    await supabase.from("lead_history").insert({
      lead_id: id,
      owner_id: user.id,
      event_type: "status_change",
      description: `Estado cambiado de "${existing.data?.status}" a "${parsed.data.status}"`,
      metadata: { from: existing.data?.status, to: parsed.data.status },
    });
  }

  // Si a alguien le acaban de poner este lead, que se entere
  const TAG_LABELS = {
    contacted_by: "para contactar",
    closed_by: "como cerrado por ti",
    scheduled_by: "para programar",
  } as const;

  for (const [field, label] of Object.entries(TAG_LABELS) as [keyof typeof TAG_LABELS, string][]) {
    const next = parsed.data[field];
    if (next && next !== existing.data?.[field]) {
      await notifyAssignment(
        next,
        member?.slug,
        `🎯 *Lead ${label}*\n\n${existing.data?.name ?? "Lead"}` +
          (member ? `\nTe lo asignó ${member.name}` : "")
      );
    }
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

  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
