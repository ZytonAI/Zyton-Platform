import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { notifyAssignment } from "@/lib/notify-member";

import { purgarTareasCumplidas } from "@/lib/task-cleanup";
import { taskSchema } from "@/lib/validations/task.schema";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await purgarTareasCumplidas(supabase);

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { user, member } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...parsed.data,
      due_date: parsed.data.due_date || null,
      description: parsed.data.description || null,
      owner_id: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Avisarle a quien le tocó (a menos que se la haya puesto él mismo)
  await notifyAssignment(
    data.assignee,
    member?.slug,
    `📋 *Nueva tarea*\n\n${data.title}` +
      (data.due_date ? `\nPara el ${data.due_date}` : "") +
      (member ? `\nTe la asignó ${member.name}` : "")
  );

  return NextResponse.json(data, { status: 201 });
}
