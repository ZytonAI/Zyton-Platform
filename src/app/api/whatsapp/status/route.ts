import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/permissions";
import { getWorkspaceSession } from "@/lib/wa-session";
import { getBridgeStatus } from "@/lib/wa-bridge";
import { revisarConexionWhatsapp } from "@/lib/wa-alert";
import { NextResponse } from "next/server";

// El QR y el estado de conexión cambian a cada rato — nunca se debe cachear
// esta respuesta (ni en el navegador, ni en un CDN/edge intermedio).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function jsonNoStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: NO_STORE_HEADERS });
}

/**
 * El chequeo de caída aprovecha este poll. Es la red de seguridad por si el
 * cron no está corriendo (sin `CRON_SECRET` o con `DISABLE_CRON=1` queda
 * apagado, y entonces nadie más mira).
 *
 * Con freno: la pantalla de chat pregunta cada 5 s y pueden ser cuatro
 * pestañas a la vez — serían 48 consultas por minuto para responder casi
 * siempre "sigue conectado". Una cada 30 s alcanza de sobra, porque el aviso
 * igual espera 3 minutos de gracia.
 *
 * Va sin `await`: el usuario no tiene por qué esperar a Telegram para ver su
 * pantalla, y esto nunca puede tumbar la respuesta.
 */
let ultimoChequeo = 0;
const CHEQUEO_CADA_MS = 30_000;

function revisarEnSegundoPlano(estado: string | null) {
  const ahora = Date.now();
  if (ahora - ultimoChequeo < CHEQUEO_CADA_MS) return;
  ultimoChequeo = ahora;

  void revisarConexionWhatsapp(createServiceClient(), estado).catch((err) => {
    console.error("[whatsapp/status] el chequeo de caída falló:", err);
  });
}

export async function GET() {
  const supabase = await createClient();
  const { user, role } = await getSession();
  if (!user) return jsonNoStore({ error: "Unauthorized" }, { status: 401 });

  // Vincular un celular al número del equipo es del Dueño. A un Socio no se le
  // manda el QR: con la imagen en la mano cualquiera enlaza su propio WhatsApp
  // al número de la empresa, y esconderlo solo en la interfaz no serviría —
  // basta abrir la pestaña de red. (Va por el rol efectivo, así que en "Ver
  // como" el Dueño ve lo mismo que vería el Socio, que es el punto de esa vista.)
  const puedeEscanear = isOwner(role);

  // La sesión de WhatsApp es del workspace: el equipo comparte un solo número,
  // así que se actualiza la fila existente sin importar quién la conectó.
  const session = await getWorkspaceSession(supabase);

  try {
    const bridgeStatus = await getBridgeStatus();

    // Una sola fila para todo el equipo: se actualiza la que haya, y solo se
    // crea si nadie ha conectado nunca. (Antes era un upsert por owner_id,
    // de cuando cada quien conectaba su propio número.)
    //
    // El QR NO se guarda (migración 027): `wa_sessions` la leen los cuatro,
    // así que persistirlo era dejarlo al alcance de cualquiera con la anon key.
    // Viaja del bridge al navegador del Dueño y no queda en ningún lado.
    const row = {
      status: bridgeStatus.status,
      phone: bridgeStatus.phone,
      updated_at: new Date().toISOString(),
    };

    if (session) {
      await supabase.from("wa_sessions").update(row).eq("id", session.id);
    } else {
      await supabase.from("wa_sessions").insert({ ...row, owner_id: user.id });
    }

    revisarEnSegundoPlano(bridgeStatus.status);

    return jsonNoStore({
      status: bridgeStatus.status,
      phone: bridgeStatus.phone,
      qr: puedeEscanear ? bridgeStatus.qr : null,
      can_scan: puedeEscanear,
    });
  } catch (err) {
    // Bridge inaccesible: usar Supabase como fuente de verdad, pero dejar
    // rastro del motivo real (timeout, 401 por token distinto, DNS, etc.)
    // para poder diagnosticar sin adivinar.
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp/status] no se pudo contactar el bridge:", reason);

    // Que el bridge no conteste cuenta como caída para el aviso: el equipo se
    // queda sin poder escribir igual, sea por desvinculación o porque el
    // servicio se murió.
    revisarEnSegundoPlano(null);

    if (session) {
      // Si el bridge no responde y Supabase dice "connected", no podemos verificarlo:
      // devolver "disconnected" para no mostrar la vista de chat sin conexión real.
      const fallbackStatus = session.status === "connected" ? "disconnected" : session.status;
      return jsonNoStore({
        status: fallbackStatus,
        phone: null,
        // Sin bridge no hay QR posible: el guardado rotó hace rato y no sirve.
        qr: null,
        can_scan: puedeEscanear,
        bridge_error: reason,
      });
    }

    return jsonNoStore({
      status: "disconnected",
      qr: null,
      phone: null,
      can_scan: puedeEscanear,
      bridge_error: reason,
    });
  }
}
