import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectBridge } from "@/lib/wa-bridge";

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    await disconnectBridge();

    await supabase
      .from("wa_sessions")
      .update({ status: "disconnected", phone: null, updated_at: new Date().toISOString() })
      .eq("owner_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
