import { createClient } from "@/lib/supabase/server";
import { getWorkspaceSession } from "@/lib/wa-session";
import { getBridgeStatus } from "@/lib/wa-bridge";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Sesión compartida por el equipo: se actualiza la fila existente, sin importar
  // quién de los cuatro fue el que conectó el número.
  const session = await getWorkspaceSession(supabase);

  try {
    const bridgeStatus = await getBridgeStatus();

    await supabase.from("wa_sessions").upsert(
      {
        owner_id: session?.owner_id ?? user.id,
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
    if (session) {
      // Si el bridge no responde y Supabase dice "connected", no podemos verificarlo:
      // devolver "disconnected" para no mostrar la vista de chat sin conexión real.
      const fallbackStatus = session.status === "connected" ? "disconnected" : session.status;
      return NextResponse.json({
        status: fallbackStatus,
        phone: null,
        qr: session.qr_code ?? null,
      });
    }

    return NextResponse.json({ status: "disconnected", qr: null, phone: null });
  }
}
