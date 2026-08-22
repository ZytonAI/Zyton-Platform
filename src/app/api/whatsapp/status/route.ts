import { createClient } from "@/lib/supabase/server";
import { getWorkspaceSession } from "@/lib/wa-session";
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

  // La sesión de WhatsApp es del workspace: el equipo comparte un solo número,
  // así que se actualiza la fila existente sin importar quién la conectó.
  const session = await getWorkspaceSession(supabase);

  try {
    const bridgeStatus = await getBridgeStatus();

    // Una sola fila para todo el equipo: se actualiza la que haya, y solo se
    // crea si nadie ha conectado nunca. (Antes era un upsert por owner_id,
    // de cuando cada quien conectaba su propio número.)
    const row = {
      status: bridgeStatus.status,
      phone: bridgeStatus.phone,
      qr_code: bridgeStatus.qr,
      updated_at: new Date().toISOString(),
    };

    if (session) {
      await supabase.from("wa_sessions").update(row).eq("id", session.id);
    } else {
      await supabase.from("wa_sessions").insert({ ...row, owner_id: user.id });
    }

    return jsonNoStore(bridgeStatus);
  } catch (err) {
    // Bridge inaccesible: usar Supabase como fuente de verdad, pero dejar
    // rastro del motivo real (timeout, 401 por token distinto, DNS, etc.)
    // para poder diagnosticar sin adivinar.
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp/status] no se pudo contactar el bridge:", reason);

    if (session) {
      // Si el bridge no responde y Supabase dice "connected", no podemos verificarlo:
      // devolver "disconnected" para no mostrar la vista de chat sin conexión real.
      const fallbackStatus = session.status === "connected" ? "disconnected" : session.status;
      return jsonNoStore({
        status: fallbackStatus,
        phone: null,
        qr: session.qr_code ?? null,
        bridge_error: reason,
      });
    }

    return jsonNoStore({ status: "disconnected", qr: null, phone: null, bridge_error: reason });
  }
}
