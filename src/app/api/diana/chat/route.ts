import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { processDianaMessage } from "@/lib/diana-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  // Solo para verificar auth — las queries las hace el service client
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    message?: string;
    channel?: "web" | "telegram";
  };

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const baseUrl = new URL(request.url).origin;
  const db = createServiceClient();

  const reply = await processDianaMessage(
    user.id,
    body.message.trim(),
    body.channel ?? "web",
    db,
    baseUrl
  );

  return NextResponse.json({ reply });
}

export async function GET(request: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const channel = (url.searchParams.get("channel") ?? "web") as "web" | "telegram";

  const db = createServiceClient();

  const { data, error } = await db
    .from("diana_messages")
    .select("id,role,content,created_at")
    .eq("owner_id", user.id)
    .eq("channel", channel)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: tasks } = await db
    .from("diana_tasks")
    .select("id,agent,status,result_summary,created_at,completed_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({ messages: data ?? [], tasks: tasks ?? [] });
}
