import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const updatePageSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.unknown().optional(),
  icon: z.string().max(16).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  position: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = updatePageSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const body = parsedBody.data;
  const allowed: Record<string, unknown> = {};
  if (body.title     !== undefined) allowed.title     = body.title;
  if (body.content   !== undefined) allowed.content   = body.content;
  if (body.icon      !== undefined) allowed.icon      = body.icon;
  if (body.parent_id !== undefined) allowed.parent_id = body.parent_id;
  if (body.position  !== undefined) allowed.position  = body.position;

  const { data, error } = await supabase
    .from("workspace_pages")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { error } = await supabase
    .from("workspace_pages")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
