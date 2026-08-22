import { createClient } from "@/lib/supabase/server";
import { withColumnFallback } from "@/lib/pg-compat";
import { NextResponse } from "next/server";
import { z } from "zod";

const createPageSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.unknown().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  icon: z.string().max(16).optional(),
  // personal = solo la ve quien la crea (RLS, migración 019)
  visibility: z.enum(["team", "personal"]).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workspace_pages")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createPageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const {
    title = "Sin título",
    content = { type: "doc", content: [{ type: "paragraph" }] },
    parent_id = null,
    icon = "📄",
    visibility = "team",
  } = parsed.data;

  const { data, error } = await withColumnFallback(
    { owner_id: user.id, title, content, parent_id, icon, visibility, updated_by: user.id },
    (row) => supabase.from("workspace_pages").insert(row).select().single()
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
