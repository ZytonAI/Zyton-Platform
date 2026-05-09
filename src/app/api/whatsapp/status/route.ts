import { createClient } from "@/lib/supabase/server";
import { getBridgeStatus } from "@/lib/wa-bridge";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const bridgeStatus = await getBridgeStatus();

    await supabase.from("wa_sessions").upsert(
      {
        owner_id: user.id,
        status: bridgeStatus.status,
        phone: bridgeStatus.phone,
        qr_code: bridgeStatus.qr,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    );

    return NextResponse.json(bridgeStatus);
  } catch {
    // Bridge inaccesible: usar Supabase como fuente de verdad
    const { data: session } = await supabase
      .from("wa_sessions")
      .select("status, phone, qr_code")
      .eq("owner_id", user.id)
      .single();

    if (session) {
      return NextResponse.json({
        status: session.status,
        phone: session.phone ?? null,
        qr: session.qr_code ?? null,
      });
    }

    return NextResponse.json({ status: "disconnected", qr: null, phone: null });
  }
}
