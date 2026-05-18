import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

export async function POST() {
  // Auth via cookies (navegador)
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = randomBytes(16).toString("hex");

  // Service role para bypassear RLS en profiles
  const db = createServiceClient();
  const { error } = await db
    .from("profiles")
    .upsert({ id: user.id, telegram_link_token: token }, { onConflict: "id" });

  if (error) {
    console.error("[generate-token] Error guardando token:", error.message);
    return NextResponse.json({ error: `Error BD: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ token });
}

export async function GET() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();
  const { data } = await db
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ connected: !!data?.telegram_chat_id });
}
