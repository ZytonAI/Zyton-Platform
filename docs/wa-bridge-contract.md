# Contrato Bridge ↔ Plataforma (WhatsApp)

Referencia del protocolo entre el servicio `whatsapp-service/` (VPS) y la plataforma
Next.js. Ambas direcciones se autentican con el **mismo secreto compartido**
(`WA_BRIDGE_TOKEN` en la plataforma = `BRIDGE_TOKEN` en el bridge).

## Dirección 1: Plataforma → Bridge

Header requerido: `x-bridge-token: <token>`. Cliente: `src/lib/wa-bridge.ts`.

| Endpoint | Request | Response |
|---|---|---|
| `GET /status` | — | `{ status: "disconnected"\|"connecting"\|"connected", qr: string\|null (data URL), phone: string\|null }` |
| `POST /reconnect` | — | `{ message: string }` |
| `POST /disconnect` | — | `{ ok: true }` |
| `POST /send` | `{ to: "<digitos>@c.us", body: string }` | `{ ok: true, wa_message_id: string }` |
| `POST /send-file` | `{ to, base64, mimeType, fileName }` | `{ ok: true, wa_message_id: string }` |

Notas:
- `wa_message_id` DEBE ser el id serializado real de WhatsApp — la plataforma lo usa
  para deduplicar y para aplicar los acks.
- En `/send-file`, si `mimeType` es `text/html` el bridge convierte a PDF (Puppeteer)
  antes de enviar.
- Límite práctico de WhatsApp para archivos: 16 MB.

## Dirección 2: Bridge → Plataforma (webhook)

`POST {PLATAFORMA}/api/whatsapp/webhook` con header `x-webhook-secret: <token>`.
El payload es una unión discriminada por `type` (si falta, se asume `"message"` —
retro-compatible con bridges antiguos).

### Evento `message` (mensaje entrante)

```jsonc
{
  "type": "message",              // opcional, default
  "wa_chat_id": "573001234567@c.us",   // requerido
  "wa_message_id": "false_573..._ABC", // requerido, id serializado
  "body": "hola",                 // opcional si hay media; captions van aquí
  "contact_phone": "573001234567",
  "contact_name": "Juan Pérez",
  "timestamp": "2026-07-11T10:30:00.000Z", // ISO 8601
  "session_phone": "573009998877",  // número conectado — REQUERIDO para multi-usuario
  // Solo si el mensaje trae media:
  "media_base64": "<base64>",     // cap ~3 MB crudos (base64 ≤ 4 MB; Vercel limita el body a 4.5 MB)
  "media_mime": "image/jpeg",
  "media_filename": "foto.jpg"    // opcional
}
```

Reglas para el bridge:
- Enviar TODOS los tipos: texto, imagen, video, audio/nota de voz (`audio/ogg`),
  documento, sticker (`image/webp`).
- Ubicación → texto `"📍 <lat>,<long> — <descripción>"`. Contacto/vCard → texto con los datos.
- Media que exceda el límite → enviar solo `body: "[Archivo demasiado grande]"`.
- Ignorar grupos (`@g.us`) y estados (`status@broadcast`).
- Respuestas: `200` ok (`skipped: true` si era duplicado), `400` payload inválido,
  `401` secreto incorrecto, `413` media demasiado grande, `503` sin sesión registrada.

### Evento `ack` (estado de mensaje saliente)

```jsonc
{
  "type": "ack",
  "wa_message_id": "true_573..._XYZ", // requerido
  "status": "delivered" | "read" | "failed",
  "session_phone": "573009998877"
}
```

- Mapeo whatsapp-web.js: `message_ack` 2 → `delivered`, 3 y 4 → `read`.
- La plataforma aplica los acks de forma **monotónica** (`sent → delivered → read`;
  `failed` siempre gana): reenviar acks viejos o duplicados es inocuo.

### Idempotencia y reintentos

El webhook deduplica por `wa_message_id`, así que la entrega "al menos una vez" es
segura: ante un 5xx, reintentar hasta 3 veces con backoff y luego descartar.

### Resolución del owner

Con `session_phone`, la plataforma busca la sesión (`wa_sessions.phone`) cuyo número
coincida y asigna el mensaje a ese usuario. Sin `session_phone` cae al comportamiento
legado (sesión actualizada más recientemente) — **deprecado**, falla con más de un
usuario conectado.
