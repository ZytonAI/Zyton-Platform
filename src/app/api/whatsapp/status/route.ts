import { createClient } from "@/lib/supabase/server";
import { getBridgeStatus } from "@/lib/wa-bridge";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const bridgeStatus = await getBridgeStatus();

    // Sincronizar el estado en Supabase
    await supabase.from("wa_sessions").upsert(
      {
        owner_id: user.id,
        status: bridgeStatus.status,
        phone: bridgeStatus.phone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    );

    return NextResponse.json(bridgeStatus);
  } catch {
    // Si el bridge no está disponible, devolver estado desconectado
    return NextResponse.json({ status: "disconnected", qr: null, phone: null });
  }
}
