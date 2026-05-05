const WA_BRIDGE_URL = process.env.WA_BRIDGE_URL!;
const WA_BRIDGE_TOKEN = process.env.WA_BRIDGE_TOKEN!;

async function bridgeFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${WA_BRIDGE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-bridge-token": WA_BRIDGE_TOKEN,
      ...(options.headers ?? {}),
    },
  });
  return res;
}

export async function getBridgeStatus() {
  const res = await bridgeFetch("/status");
  if (!res.ok) throw new Error("Error al contactar el servicio WA");
  return res.json() as Promise<{ status: string; qr: string | null; phone: string | null }>;
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
