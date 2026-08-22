import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { notifyAssignment } from "@/lib/notify-member";
import { taskSchema } from "@/lib/validations/task.schema";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, member } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = taskSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  if ("due_date" in parsed.data)    update.due_date = parsed.data.due_date || null;
  if ("description" in parsed.data) update.description = parsed.data.description || null;

  // Para saber si la tarea cambió de manos
  const previous = await supabase.from("tasks").select("assignee").eq("id", id).maybeSingle();

  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.assignee && parsed.data.assignee !== previous.data?.assignee) {
    await notifyAssignment(
      data.assignee,
      member?.slug,
      `📋 *Te pasaron una tarea*\n\n${data.title}` +
        (data.due_date ? `\nPara el ${data.due_date}` : "") +
        (member ? `\nTe la asignó ${member.name}` : "")
    );
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

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
