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
