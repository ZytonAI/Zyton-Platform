// =============================================================
// Zyton WhatsApp Service — bridge entre WhatsApp y la plataforma
//
// Expone la API que consume src/lib/wa-bridge.ts de la plataforma
// (auth: header "x-bridge-token") y reenvía todo lo que llega de
// WhatsApp al webhook de la plataforma (auth: "x-webhook-secret").
// El contrato completo está en docs/wa-bridge-contract.md del repo.
// =============================================================

const express = require("express");
const QRCode = require("qrcode");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const PORT = Number(process.env.PORT || 3001);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WA_SESSION_PATH = process.env.WA_SESSION_PATH || "./.wwebjs_auth";
const MAX_MEDIA_BYTES = Number(process.env.MAX_MEDIA_MB || 3) * 1024 * 1024;

if (!BRIDGE_TOKEN) {
  console.error("Falta BRIDGE_TOKEN en el entorno. Abortando.");
  process.exit(1);
}
if (!WEBHOOK_URL) {
  console.warn("WEBHOOK_URL no está definido: los mensajes entrantes NO se reenviarán a la plataforma.");
}

// ── Estado de la sesión ──
let status = "disconnected"; // disconnected | connecting | connected
let qrDataUrl = null;
let sessionPhone = null; // número conectado, solo dígitos

// ── Cliente de WhatsApp ──
function buildClient() {
  return new Client({
    authStrategy: new LocalAuth({ dataPath: WA_SESSION_PATH }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
    // Sin esto, whatsapp-web.js puede quedar pegado a una versión vieja de
    // WhatsApp Web (cacheada en disco o remota) y WhatsApp rechaza el
    // pairing con "no se puede vincular el dispositivo". "none" fuerza a
    // tomar siempre la versión que WhatsApp está sirviendo en ese momento.
    webVersionCache: { type: "none" },
  });
}

let client = buildClient();

function wireClientEvents(c) {
  c.on("qr", async (qr) => {
    status = "connecting";
    sessionPhone = null;
    try {
      qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 1 });
    } catch {
      qrDataUrl = null;
    }
    console.log("QR generado — esperando escaneo");
  });

  c.on("ready", () => {
    status = "connected";
    qrDataUrl = null;
    sessionPhone = c.info?.wid?.user ?? null;
    console.log(`WhatsApp conectado como ${sessionPhone}`);
  });

  c.on("disconnected", (reason) => {
    status = "disconnected";
    qrDataUrl = null;
    sessionPhone = null;
    console.log(`WhatsApp desconectado: ${reason}`);
  });

  c.on("auth_failure", (msg) => {
    status = "disconnected";
    qrDataUrl = null;
    console.error(`Fallo de autenticación: ${msg}`);
  });

  // ── Mensajes entrantes → webhook de la plataforma ──
  c.on("message", async (msg) => {
    try {
      await forwardIncomingMessage(msg);
    } catch (err) {
      console.error("Error reenviando mensaje al webhook:", err.message);
    }
  });

  // ── Acks (entregado/leído) → webhook de la plataforma ──
  // message_ack: 1 = enviado al servidor, 2 = entregado, 3 = leído, 4 = reproducido
  c.on("message_ack", (msg, ack) => {
    const ackStatus = ack === 3 || ack === 4 ? "read" : ack === 2 ? "delivered" : null;
    if (!ackStatus) return;
    postWebhook({
      type: "ack",
      wa_message_id: msg.id?._serialized,
      status: ackStatus,
      session_phone: sessionPhone,
    }).catch(() => {});
  });
}

wireClientEvents(client);

// ── Reenvío de mensajes entrantes ──
async function forwardIncomingMessage(msg) {
  // Ignorar estados/historias y mensajes de grupos (la plataforma modela chats 1:1)
  if (msg.from === "status@broadcast" || msg.from.endsWith("@g.us")) return;

  const contact = await msg.getContact().catch(() => null);
  const contactName = contact?.pushname || contact?.name || null;
  const contactPhone = contact?.number || msg.from.replace(/@.*$/, "");

  const payload = {
    type: "message",
    wa_chat_id: msg.from,
    wa_message_id: msg.id._serialized,
    contact_phone: contactPhone,
    contact_name: contactName,
    timestamp: new Date(msg.timestamp * 1000).toISOString(),
    session_phone: sessionPhone,
    body: msg.body || "",
  };

  // Tipos especiales sin media descargable → texto representativo
  if (msg.type === "location" && msg.location) {
    payload.body = `📍 ${msg.location.latitude},${msg.location.longitude}` +
      (msg.location.description ? ` — ${msg.location.description}` : "");
  } else if (msg.type === "vcard" || msg.type === "multi_vcard") {
    payload.body = `👤 Contacto compartido:\n${msg.body || msg.vCards?.join("\n") || ""}`.trim();
  } else if (msg.hasMedia) {
    // Imagen, video, audio/nota de voz, documento, sticker
    const media = await msg.downloadMedia().catch(() => null);
    if (media?.data) {
      const rawBytes = Buffer.byteLength(media.data, "base64");
      if (rawBytes <= MAX_MEDIA_BYTES) {
        payload.media_base64 = media.data;
        payload.media_mime = media.mimetype;
        payload.media_filename = media.filename || null;
      } else if (!payload.body) {
        payload.body = "[Archivo demasiado grande]";
      }
    } else if (!payload.body) {
      payload.body = "[Archivo no disponible]";
    }
  }

  // El webhook exige body o media
  if (!payload.body && !payload.media_base64) payload.body = `[${msg.type}]`;

  await postWebhook(payload);
}

// ── POST al webhook con reintentos (el webhook es idempotente) ──
async function postWebhook(payload, attempt = 1) {
  if (!WEBHOOK_URL) return;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": BRIDGE_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok && res.status >= 500 && attempt < 3) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      return postWebhook(payload, attempt + 1);
    }
    console.error(`Webhook falló tras ${attempt} intentos:`, err.message);
  }
}

// ── HTML → PDF con el Puppeteer que ya trae whatsapp-web.js ──
async function htmlToPdf(htmlBase64) {
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const html = Buffer.from(htmlBase64, "base64").toString("utf8");
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf).toString("base64");
  } finally {
    await browser.close();
  }
}

// ── API HTTP ──
const app = express();
app.use(express.json({ limit: "25mb" }));

// Healthcheck público (sin token) — para que EasyPanel/Docker/balanceadores
// puedan verificar que el proceso está vivo sin necesitar el secreto.
// No expone estado de la sesión de WhatsApp, solo que el servidor responde.
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.get("/", (_req, res) => res.status(200).json({ ok: true, service: "zyton-wa-bridge" }));

// Auth: el resto de rutas exige el token compartido
app.use((req, res, next) => {
  if (req.headers["x-bridge-token"] !== BRIDGE_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.get("/status", (_req, res) => {
  res.json({ status, qr: qrDataUrl, phone: sessionPhone });
});

app.post("/reconnect", async (_req, res) => {
  try {
    if (status === "connected") {
      return res.json({ message: "Ya conectado" });
    }
    status = "connecting";
    await client.initialize();
    res.json({ message: "Inicializando — escanea el QR desde /status" });
  } catch (err) {
    status = "disconnected";
    res.status(500).json({ error: err.message });
  }
});

app.post("/disconnect", async (_req, res) => {
  try {
    await client.logout().catch(() => {});
    await client.destroy().catch(() => {});
    status = "disconnected";
    qrDataUrl = null;
    sessionPhone = null;
    // Cliente nuevo para poder volver a conectar sin reiniciar el proceso
    client = buildClient();
    wireClientEvents(client);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/send", async (req, res) => {
  const { to, body } = req.body ?? {};
  if (!to || !body) {
    return res.status(400).json({ error: "Faltan campos: to, body" });
  }
  if (status !== "connected") {
    return res.status(503).json({ error: "WhatsApp no está conectado" });
  }
  try {
    const sent = await client.sendMessage(to, body);
    res.json({ ok: true, wa_message_id: sent.id._serialized });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error enviando mensaje" });
  }
});

app.post("/send-file", async (req, res) => {
  const { to, base64, mimeType, fileName } = req.body ?? {};
  if (!to || !base64 || !mimeType || !fileName) {
    return res.status(400).json({ error: "Faltan campos: to, base64, mimeType, fileName" });
  }
  if (status !== "connected") {
    return res.status(503).json({ error: "WhatsApp no está conectado" });
  }
  try {
    let fileBase64 = base64;
    let fileMime = mimeType;
    let finalName = fileName;

    // Los informes llegan como HTML y se convierten a PDF aquí
    if (mimeType === "text/html") {
      fileBase64 = await htmlToPdf(base64);
      fileMime = "application/pdf";
      if (!finalName.toLowerCase().endsWith(".pdf")) finalName += ".pdf";
    }

    const media = new MessageMedia(fileMime, fileBase64, finalName);
    const sent = await client.sendMessage(to, media, {
      sendMediaAsDocument: !fileMime.startsWith("image/") && !fileMime.startsWith("video/"),
    });
    res.json({ ok: true, wa_message_id: sent.id._serialized });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error enviando archivo" });
  }
});

app.listen(PORT, () => {
  console.log(`Zyton WhatsApp Service escuchando en :${PORT}`);
  // Inicializar al arrancar: si hay sesión persistida en disco, reconecta solo
  status = "connecting";
  client.initialize().catch((err) => {
    status = "disconnected";
    console.error("Error inicializando WhatsApp:", err.message);
  });
});
