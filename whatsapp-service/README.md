# Zyton WhatsApp Service

Bridge entre WhatsApp (vía [whatsapp-web.js](https://wwebjs.dev)) y la plataforma Zyton.
Corre como un servicio Node.js independiente en tu VPS y habla con la plataforma en dos direcciones:

- **Plataforma → bridge**: la plataforma llama a `/status`, `/reconnect`, `/disconnect`, `/send` y `/send-file` con el header `x-bridge-token`.
- **Bridge → plataforma**: cada mensaje entrante y cada ack (entregado/leído) se reenvía al webhook `POST /api/whatsapp/webhook` con el header `x-webhook-secret`.

El contrato completo de payloads está en [`docs/wa-bridge-contract.md`](../docs/wa-bridge-contract.md).

## Requisitos

- Node.js ≥ 18 (usa `fetch` nativo)
- Dependencias de Chromium para Puppeteer (en Debian/Ubuntu):

```bash
sudo apt-get install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
  libxcomposite1 libxdamage1 libxrandr2 xdg-utils
```

## Instalación

```bash
cd whatsapp-service
npm install
cp .env.example .env
# editar .env: BRIDGE_TOKEN (mismo valor que WA_BRIDGE_TOKEN en la plataforma)
#              WEBHOOK_URL (https://tu-plataforma.vercel.app/api/whatsapp/webhook)
npm start
```

Al arrancar intenta restaurar la sesión persistida en `WA_SESSION_PATH`. Si no hay sesión,
queda en estado `connecting` y publica el QR en `/status`; la plataforma lo muestra en la
página de Chat para escanearlo.

## Correr como servicio (PM2)

```bash
npm install -g pm2
pm2 start src/index.js --name zyton-wa
pm2 save
pm2 startup   # seguir las instrucciones para arrancar con el sistema
```

O con systemd (`/etc/systemd/system/zyton-wa.service`):

```ini
[Unit]
Description=Zyton WhatsApp Service
After=network.target

[Service]
WorkingDirectory=/opt/zyton/whatsapp-service
ExecStart=/usr/bin/node src/index.js
Restart=always
EnvironmentFile=/opt/zyton/whatsapp-service/.env

[Install]
WantedBy=multi-user.target
```

## Despliegue con Docker / EasyPanel

Este directorio incluye un `Dockerfile` que instala Chromium del sistema (más liviano
y confiable que dejar que Puppeteer descargue el suyo). En EasyPanel:

1. **Fuente**: GitHub → Propietario `ZytonAI`, Repositorio `Zyton-Platform`, Rama `main`,
   Ruta de compilación `/whatsapp-service`.
2. **Compilación**: elegir **Dockerfile** (no Nixpacks/Buildpacks — necesitan las
   dependencias de Chromium que el Dockerfile ya instala).
3. **Variables de entorno**: las mismas de `.env.example` (`PORT`, `BRIDGE_TOKEN`,
   `WEBHOOK_URL`, `WA_SESSION_PATH`, `MAX_MEDIA_MB`). No hace falta setear
   `PUPPETEER_EXECUTABLE_PATH` — el Dockerfile ya lo define.
4. **Volumen persistente**: monta uno en `/app/.wwebjs_auth` (o el valor que pongas en
   `WA_SESSION_PATH`). Sin esto, cada redeploy borra la sesión y hay que re-escanear el QR.
5. **Puerto**: exponer `3001` (o el valor de `PORT`) y apuntar `WA_BRIDGE_URL` en Vercel
   a la URL pública que te dé EasyPanel.

## Endpoints

Todos exigen el header `x-bridge-token: $BRIDGE_TOKEN` (401 sin él).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/status` | `{ status: "disconnected"\|"connecting"\|"connected", qr: dataURL\|null, phone: string\|null }` |
| POST | `/reconnect` | Inicializa el cliente; genera QR si no hay sesión |
| POST | `/disconnect` | Cierra sesión y destruye el cliente |
| POST | `/send` | `{ to, body }` → `{ ok, wa_message_id }` |
| POST | `/send-file` | `{ to, base64, mimeType, fileName }` → `{ ok, wa_message_id }`. Si `mimeType` es `text/html`, se convierte a PDF |

## Qué reenvía al webhook

- **Mensajes entrantes** de chats 1:1 (los grupos y estados se ignoran): texto, imágenes,
  videos, audios/notas de voz, documentos y stickers (media en base64, cap `MAX_MEDIA_MB`).
  Ubicaciones y contactos compartidos se convierten a texto.
- **Acks**: `delivered` (ack 2) y `read` (ack 3/4) de los mensajes salientes.

Reintenta hasta 3 veces con backoff si el webhook responde 5xx; el webhook es idempotente
(`wa_message_id` deduplica), así que la entrega "al menos una vez" es segura.
