const WA_BRIDGE_URL = process.env.WA_BRIDGE_URL!;
const WA_BRIDGE_TOKEN = process.env.WA_BRIDGE_TOKEN!;

async function bridgeFetch(path: string, options: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${WA_BRIDGE_URL}${path}`, {
      ...options,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        "x-bridge-token": WA_BRIDGE_TOKEN,
        ...(options.headers ?? {}),
      },
    });
  } catch (err) {
    // Distinguir "no contesta / DNS / timeout" de un error HTTP normal,
    // para que quede claro en los logs si el bridge es inalcanzable.
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`No se pudo contactar el bridge (${WA_BRIDGE_URL}${path}): ${reason}`);
  }
  return res;
}

/**
 * Los errores que salen de dentro de WhatsApp Web llegan crudos, con su URL
 * del bundle detrás ("No LID for user s (https://static.whatsapp.net/...)").
 * Eso no le dice nada a nadie, y era lo que aparecía en la burbuja del chat.
 */
export function mensajeDeErrorLegible(raw: string): string {
  if (/no tiene whatsapp/i.test(raw)) return raw;
  if (/no lid for user/i.test(raw)) {
    return "WhatsApp no pudo resolver a quién mandarle el mensaje. Suele arreglarse si el contacto escribe primero; si sigue, reconecta la sesión.";
  }
  if (/no está conectado|not connected/i.test(raw)) {
    return "WhatsApp no está conectado. Escanea el QR desde el chat.";
  }
  if (/no se pudo contactar el bridge/i.test(raw)) {
    return "El servicio de WhatsApp no responde. Revisa que esté arriba en EasyPanel.";
  }
  // Lo que no reconocemos se muestra igual, pero sin la URL del bundle detrás
  return raw.replace(/\s*\(https?:\/\/[^)]*\)/g, "").trim() || "Error enviando mensaje";
}

export async function getBridgeStatus() {
  const res = await bridgeFetch("/status");
  if (!res.ok) throw new Error(`Bridge error ${res.status}`);
  return res.json() as Promise<{ status: string; qr: string | null; phone: string | null }>;
}

export async function reconnectBridge() {
  const res = await bridgeFetch("/reconnect", { method: "POST" });
  if (!res.ok) throw new Error(`Bridge error ${res.status}`);
  return res.json() as Promise<{ message: string }>;
}

export async function disconnectBridge() {
  const res = await bridgeFetch("/disconnect", { method: "POST" });
  if (!res.ok) throw new Error(`Bridge error ${res.status}`);
  return res.json() as Promise<{ ok: boolean }>;
}

/**
 * A qué identificador hay que mandarle el mensaje de una conversación: el
 * `@lid` manda sobre el teléfono, porque es como WhatsApp direcciona ahora.
 * Sin `@lid` resuelto se cae al `wa_chat_id` de siempre.
 */
export function destinoDe(conv: { wa_chat_id: string; wa_lid?: string | null }): string {
  return conv.wa_lid || conv.wa_chat_id;
}

export interface DestinoWa {
  /** A qué identificador hay que mandarle (el @lid si se pudo resolver) */
  destino: string;
  /** El @lid del contacto, null si no se pudo averiguar */
  lid: string | null;
  /** true/false si se pudo comprobar; null si no se pudo saber */
  existe: boolean | null;
}

/**
 * Le pregunta al bridge con qué identificador hay que hablarle a un número y
 * si siquiera tiene WhatsApp. Devuelve null si el bridge no contesta o no está
 * conectado: eso no debe impedir abrir el chat, solo deja el `@lid` sin
 * resolver hasta el primer mensaje.
 */
export async function resolveBridgeDestination(to: string): Promise<DestinoWa | null> {
  try {
    const res = await bridgeFetch("/resolve", {
      method: "POST",
      body: JSON.stringify({ to }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<DestinoWa>;
    return {
      destino: data.destino ?? to,
      lid: data.lid ?? null,
      existe: data.existe ?? null,
    };
  } catch {
    return null;
  }
}

export async function sendBridgeMessage(to: string, body: string) {
  const res = await bridgeFetch("/send", {
    method: "POST",
    body: JSON.stringify({ to, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error desconocido" }));
    throw new Error(err.error ?? "Error enviando mensaje");
  }
  return res.json() as Promise<{ ok: boolean; wa_message_id: string }>;
}

export async function sendBridgeFile(to: string, base64: string, mimeType: string, fileName: string) {
  const res = await bridgeFetch("/send-file", {
    method: "POST",
    body: JSON.stringify({ to, base64, mimeType, fileName }),
  });
  if (!res.ok) {
    // Leer el cuerpo como texto crudo para ver el error real aunque no sea JSON
    const raw = await res.text().catch(() => "");
    let errMsg: string;
    try {
      const parsed = JSON.parse(raw);
      errMsg = parsed.error ?? raw;
    } catch {
      // El bridge devolvió algo que no es JSON (ej: 413, HTML de error, cuerpo vacío)
      errMsg = raw.slice(0, 300) || `HTTP ${res.status} sin cuerpo`;
    }
    throw new Error(`[Bridge ${res.status}] ${errMsg}`);
  }
  return res.json() as Promise<{ ok: boolean; wa_message_id: string }>;
}
