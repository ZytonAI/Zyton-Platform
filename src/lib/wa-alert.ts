/**
 * Aviso de "WhatsApp se cayó".
 *
 * El número lo comparten los cuatro, así que cuando la sesión se desconecta
 * el chat deja de funcionar para todo el equipo — y hasta ahora nadie se
 * enteraba hasta que alguien abría la pestaña y se encontraba el QR. Un
 * mensaje del bot le llega al Dueño (solo a él: es el único que puede volver
 * a vincular el celular) apenas la caída se confirma.
 *
 * Por qué se comprueba desde aquí y no desde el bridge: `whatsapp-service/`
 * está congelado — cada cambio ahí lo redespliega EasyPanel y eso mismo
 * cierra la sesión. Así que el CRM le pregunta el estado al bridge, que es
 * justo lo que ya hacía la pantalla de chat.
 *
 * Quién lo llama:
 *   - el cron interno cada pocos minutos (src/lib/cron.ts), que es lo que
 *     hace que sirva de madrugada y con la plataforma cerrada;
 *   - la ruta /api/whatsapp/status, que ya le pregunta al bridge cada 5 s
 *     mientras alguien tenga el chat abierto. Es gratis y acorta la espera.
 *
 * Los dos caminos son idempotentes: el aviso se "reclama" con un UPDATE
 * condicional, así que aunque entren cuatro a la vez sale un solo mensaje.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBridgeStatus } from "@/lib/wa-bridge";
import { notifyMember } from "@/lib/notify-member";
import { teamOwner } from "@/lib/team";

/**
 * Cuánto tiene que llevar caída antes de avisar. Un redespliegue del bridge o
 * un parpadeo de red la dejan "disconnected" unos segundos; avisar de eso
 * sería ruido, y el ruido acaba en que nadie mira el aviso que sí importa.
 */
const GRACIA_MS = 3 * 60_000;

export interface ResultadoChequeo {
  /** Lo que dijo el bridge, o "disconnected" si ni siquiera contestó */
  estado: string;
  /** true si en esta corrida salió el mensaje de caída */
  aviso: boolean;
  /** true si en esta corrida salió el mensaje de que volvió */
  recuperado: boolean;
  /** Por qué no se hizo nada, cuando aplica — para leerlo en los logs */
  nota?: string;
}

function textoCaida(desde: Date): string {
  const minutos = Math.max(1, Math.round((Date.now() - desde.getTime()) / 60_000));
  return [
    "🔴 *WhatsApp se desconectó*",
    "",
    `El número del equipo lleva ${minutos} minuto${minutos === 1 ? "" : "s"} sin conexión. ` +
      "Mientras tanto nadie puede enviar ni recibir mensajes desde la plataforma, " +
      "y lo que escriban los leads no va a entrar al chat.",
    "",
    "Para volver a vincularlo: entra a la plataforma → *Chat* y escanea el QR con tu celular " +
      "(WhatsApp → Dispositivos vinculados → Vincular dispositivo).",
  ].join("\n");
}

function textoVuelta(desde: Date | null): string {
  const cuanto = desde
    ? ` Estuvo caído ${Math.max(1, Math.round((Date.now() - desde.getTime()) / 60_000))} minutos.`
    : "";
  return `🟢 *WhatsApp volvió a conectarse*\n\nEl chat del equipo ya está operando normal.${cuanto}`;
}

/**
 * Mira cómo está la sesión y avisa si hace falta. No lanza nunca: es un
 * chequeo de fondo y no debe tumbar a quien lo llamó.
 *
 * @param db  cliente con service role — `wa_sessions` está bajo RLS y esto
 *            corre sin sesión de usuario cuando lo dispara el cron.
 * @param estadoConocido  el estado que quien llama ya le preguntó al bridge,
 *            para no preguntar dos veces. `null` = no se pudo contactar.
 */
export async function revisarConexionWhatsapp(
  db: SupabaseClient,
  estadoConocido?: string | null
): Promise<ResultadoChequeo> {
  // 1. ¿Cómo está el bridge?
  let estado: string;
  if (estadoConocido !== undefined) {
    // Que el bridge no conteste ES estar caído, a efectos del aviso: el
    // equipo no puede escribir igual, sea porque WhatsApp se desvinculó o
    // porque el servicio se murió.
    estado = estadoConocido ?? "disconnected";
  } else {
    try {
      estado = (await getBridgeStatus()).status;
    } catch {
      estado = "disconnected";
    }
  }

  // `connecting` cuenta como caído a propósito: significa "esperando que
  // alguien escanee el QR", que es exactamente de lo que hay que avisar.
  const conectado = estado === "connected";

  // 2. La fila de la sesión. Si nunca se conectó nadie, no hay caída de qué
  //    avisar — es una plataforma recién montada, no un incidente.
  const { data: fila, error } = await db
    .from("wa_sessions")
    .select("id, down_since, alerted_at, alert_muted")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Falta la migración 027, o la base no contesta. Ni se avisa ni se rompe.
    console.warn("[wa-alert] no se pudo leer wa_sessions:", error.message);
    return { estado, aviso: false, recuperado: false, nota: error.message };
  }
  if (!fila) return { estado, aviso: false, recuperado: false, nota: "sin sesión registrada" };

  const sesion = fila as {
    id: string;
    down_since: string | null;
    alerted_at: string | null;
    alert_muted?: boolean | null;
  };
  const owner = teamOwner();

  // 3. Volvió: limpiar la racha y, si se había avisado, cerrar el ciclo.
  if (conectado) {
    if (!sesion.down_since && !sesion.alerted_at) {
      return { estado, aviso: false, recuperado: false };
    }

    // Se limpia reclamando igual que el aviso: el que se lleve la fila con
    // alerted_at todavía puesto es el único que manda el "ya volvió". Y solo
    // si de verdad se avisó: una racha silenciada (el Dueño cerró la sesión
    // él mismo) no merece un "volvió" de algo que hizo a propósito.
    const yaSeHabiaAvisado = !!sesion.alerted_at && !sesion.alert_muted;
    const desde = sesion.down_since ? new Date(sesion.down_since) : null;

    const { data: limpiadas } = await db
      .from("wa_sessions")
      .update({ down_since: null, alerted_at: null, alert_muted: false })
      .eq("id", sesion.id)
      .or("down_since.not.is.null,alerted_at.not.is.null")
      .select("id");

    const gane = (limpiadas ?? []).length > 0;
    if (gane && yaSeHabiaAvisado && owner) {
      await notifyMember(owner.slug, textoVuelta(desde));
      return { estado, aviso: false, recuperado: true };
    }
    return { estado, aviso: false, recuperado: false };
  }

  // 4. Sigue caída. Primera vez que se ve: solo se anota la hora.
  if (!sesion.down_since) {
    await db
      .from("wa_sessions")
      .update({ down_since: new Date().toISOString() })
      .eq("id", sesion.id)
      .is("down_since", null);
    return { estado, aviso: false, recuperado: false, nota: "racha iniciada, en período de gracia" };
  }

  // 5. Ya se avisó de esta racha: no repetir.
  if (sesion.alerted_at) {
    return { estado, aviso: false, recuperado: false, nota: "ya se avisó de esta caída" };
  }

  // 6. ¿Aguantó caída lo suficiente?
  const desde = new Date(sesion.down_since);
  if (Date.now() - desde.getTime() < GRACIA_MS) {
    return { estado, aviso: false, recuperado: false, nota: "en período de gracia" };
  }

  // 7. Reclamar el aviso. El `.is("alerted_at", null)` es el candado: en
  //    Postgres el UPDATE condicional es atómico, así que de cuatro llamadas
  //    simultáneas solo una se lleva la fila y solo una manda el mensaje.
  const { data: reclamadas } = await db
    .from("wa_sessions")
    .update({ alerted_at: new Date().toISOString(), alert_muted: false })
    .eq("id", sesion.id)
    .is("alerted_at", null)
    .select("id");

  if (!(reclamadas ?? []).length) {
    return { estado, aviso: false, recuperado: false, nota: "otro proceso mandó el aviso" };
  }

  if (!owner) {
    return { estado, aviso: false, recuperado: false, nota: "no hay Dueño en la lista del equipo" };
  }

  await notifyMember(owner.slug, textoCaida(desde));
  console.log(`[wa-alert] WhatsApp caído (${estado}) — avisado a ${owner.name}`);
  return { estado, aviso: true, recuperado: false };
}

/**
 * Marca la caída como "ya avisada" sin mandar nada. La usa el botón de
 * desconectar del Dueño: si fue él quien la cerró, no tiene sentido que le
 * llegue un Telegram diciéndole lo que acaba de hacer.
 */
export async function silenciarProximaCaida(db: SupabaseClient): Promise<void> {
  const ahora = new Date().toISOString();
  const { data: fila } = await db
    .from("wa_sessions")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const id = (fila as { id: string } | null)?.id;
  if (!id) return;

  await db
    .from("wa_sessions")
    .update({ down_since: ahora, alerted_at: ahora, alert_muted: true })
    .eq("id", id);
}
