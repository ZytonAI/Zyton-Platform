# Zyton Platform

Hub interno de ZytonAI: leads, clientes, facturas, calendario, wiki, tareas, chat de WhatsApp y agentes de IA. Next.js 16 (App Router) + Supabase, desplegado en **EasyPanel** con Docker.

Para el detalle de arquitectura, roles y convenciones, ver [CLAUDE.md](CLAUDE.md).

## Desarrollo local

```bash
npm install
cp .env.example .env.local     # llenar con las claves de Supabase
npm run dev                    # http://localhost:3000
```

Se entra con usuario (`SamuelZY`, `CamiloZY`, …), no con email. Las cuentas se crean con:

```bash
node scripts/create-users.mjs            # crea las que falten
node scripts/create-users.mjs --reset    # resetea contraseñas
```

## Base de datos

Supabase (PostgreSQL + RLS + Storage). Las migraciones de `supabase/migrations/` se ejecutan a mano en el SQL Editor, **en orden numérico**. Ojo: hay números repetidos (008, 009, 010, 013, 014, 015) porque salieron de ramas paralelas; dentro del mismo número el orden da igual.

También hay que crear el bucket privado `attachments` en Storage.

## Deploy — EasyPanel

La app se construye con el [`Dockerfile`](Dockerfile) de la raíz (multi-stage, `output: standalone`).

Las `NEXT_PUBLIC_*` se incrustan en el bundle del cliente **durante el build**, así que van como *build args*, no como variables de runtime:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

El resto (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `WA_BRIDGE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`, …) van como variables de entorno normales. Lista completa en `.env.example`.

El servicio de WhatsApp corre aparte, desde [`whatsapp-service/`](whatsapp-service/) (contrato en [docs/wa-bridge-contract.md](docs/wa-bridge-contract.md)).

### Cron de recordatorios de facturas

`/api/diana/invoice-reminder` recicla las facturas recurrentes, marca las vencidas y le avisa al Dueño por Telegram.

**Corre solo**: el contenedor en EasyPanel vive 24/7, así que el propio servidor se programa la tarea al arrancar ([`src/instrumentation.ts`](src/instrumentation.ts) → [`src/lib/cron.ts`](src/lib/cron.ts)). No hay nada que configurar en el panel más allá de las variables:

| Variable | Efecto |
|---|---|
| `CRON_SECRET` | **Obligatoria.** Sin ella el cron no se programa (la ruta respondería 401). |
| `INVOICE_REMINDER_AT` | Hora de la corrida, `HH:MM` en **UTC**. Default `14:00` = 9:00 a.m. en Colombia. |
| `ENABLE_CRON=1` | Solo para probarlo en local; en producción no hace falta. |
| `DISABLE_CRON=1` | Apaga el cron interno (ver alternativa abajo). |

En los logs de EasyPanel se ve al arrancar y en cada corrida:

```
[cron] invoice-reminder programado a las 14:00 UTC — próxima corrida en 7h 12m
[cron] invoice-reminder ok — {"ok":true,"recurringReset":0,"reminded":2}
```

Dos cosas a tener en cuenta: si algún día se escala a más de una réplica, cada una dispararía su propia corrida; y un redeploy justo a esa hora puede saltarse la del día. Para esos casos, o si prefieres verlo en el panel, se puede apagar el interno con `DISABLE_CRON=1` y crear una Scheduled Task en EasyPanel:

```
0 14 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/diana/invoice-reminder
```

Si el cron queda apagado la app sigue funcionando: el reciclaje de recurrentes también corre al abrir la página de Facturas, pero los avisos de Telegram no salen y las vencidas no pasan a `overdue` en base.

## Comandos

```bash
npm run dev      # desarrollo
npm run build    # build de producción
npm run start    # servir el build local
npm run lint     # ESLint
```
