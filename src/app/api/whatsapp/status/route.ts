import { createClient } from "@/lib/supabase/server";
import { getBridgeStatus } from "@/lib/wa-bridge";
import { NextResponse } from "next/server";

// El QR y el estado de conexión cambian a cada rato — nunca se debe cachear
// esta respuesta (ni en el navegador, ni en un CDN/edge intermedio).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function jsonNoStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: NO_STORE_HEADERS });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonNoStore({ error: "Unauthorized" }, { status: 401 });

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

    return jsonNoStore(bridgeStatus);
  } catch {
    // Bridge inaccesible: usar Supabase como fuente de verdad
    const { data: session } = await supabase
      .from("wa_sessions")
      .select("status, phone, qr_code")
      .eq("owner_id", user.id)
      .single();

    if (session) {
      // Si el bridge no responde y Supabase dice "connected", no podemos verificarlo:
      // devolver "disconnected" para no mostrar la vista de chat sin conexión real.
      const fallbackStatus = session.status === "connected" ? "disconnected" : session.status;
      return jsonNoStore({
        status: fallbackStatus,
        phone: null,
        qr: session.qr_code ?? null,
      });
    }

    return jsonNoStore({ status: "disconnected", qr: null, phone: null });
  }
}
