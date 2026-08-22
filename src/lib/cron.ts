/**
 * Cron interno de la app.
 *
 * En Vercel esto lo hacía `vercel.json`. En EasyPanel el contenedor corre
 * 24/7, así que el propio servidor Next se programa la tarea: no hay que
 * configurar nada en el panel y el cron se despliega junto con el código.
 *
 * Lo arranca `src/instrumentation.ts`, que Next ejecuta una sola vez al
 * levantar el servidor (solo en el runtime de Node, nunca en Edge ni en el
 * navegador).
 *
 * Tarea única por ahora: el recordatorio diario de facturas, que recicla las
 * recurrentes, pasa las vencidas a `overdue` y le avisa al Dueño por Telegram.
 */

/** Hora UTC por defecto — 14:00 UTC = 9:00 a.m. en Colombia (igual que el cron viejo de Vercel). */
const DEFAULT_AT = "14:00";

const TASK_PATH = "/api/diana/invoice-reminder";

// El módulo puede evaluarse más de una vez (HMR en dev, varios entrypoints en
// el build), así que la bandera va en globalThis para no duplicar el timer.
declare global {
  var __zytonCronStarted: boolean | undefined;
}

/** "HH:MM" en UTC → {hour, minute}. Si viene mal formado, cae al default. */
function parseAt(raw: string | undefined): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec((raw ?? DEFAULT_AT).trim());
  const hour = match ? Number(match[1]) : NaN;
  const minute = match ? Number(match[2]) : NaN;

  if (!match || hour > 23 || minute > 59) {
    console.warn(
      `[cron] INVOICE_REMINDER_AT="${raw}" no es una hora válida (formato HH:MM en UTC). Usando ${DEFAULT_AT}.`
    );
    const [h, m] = DEFAULT_AT.split(":").map(Number);
    return { hour: h, minute: m };
  }
  return { hour, minute };
}

/** Milisegundos hasta la próxima vez que den las hour:minute UTC. */
function msUntil(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0)
  );
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function formatWait(ms: number): string {
  // Redondear primero a minutos: si no, 23h 59m 40s se imprimía como "23h 60m"
  const totalMinutes = Math.round(ms / 60_000);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

/**
 * Llama a la ruta como lo haría un cron externo — mismo header, mismo camino.
 * Se pega al propio servidor por loopback, así que no sale de la red interna.
 */
async function runInvoiceReminder(secret: string): Promise<void> {
  const port = process.env.PORT ?? "3000";
  const url = `http://127.0.0.1:${port}${TASK_PATH}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text().catch(() => "");
    if (res.ok) {
      console.log(`[cron] invoice-reminder ok — ${body}`);
    } else {
      console.error(`[cron] invoice-reminder respondió ${res.status} — ${body}`);
    }
  } catch (err) {
    console.error("[cron] invoice-reminder falló:", err);
  }
}

/**
 * Programa el recordatorio de facturas. Idempotente: llamarla dos veces no
 * duplica el timer.
 *
 * Se salta a sí misma si:
 *   - DISABLE_CRON=1 (para usar el scheduler de EasyPanel en su lugar)
 *   - no hay CRON_SECRET (la ruta respondería 401)
 *   - estamos en dev y no se pidió explícitamente con ENABLE_CRON=1
 */
export function startCron(): void {
  if (globalThis.__zytonCronStarted) return;

  if (process.env.DISABLE_CRON === "1") {
    console.log("[cron] apagado por DISABLE_CRON=1.");
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron] sin CRON_SECRET: el recordatorio de facturas queda apagado.");
    return;
  }

  if (process.env.NODE_ENV !== "production" && process.env.ENABLE_CRON !== "1") {
    console.log("[cron] apagado en desarrollo (ENABLE_CRON=1 para probarlo).");
    return;
  }

  globalThis.__zytonCronStarted = true;
  const { hour, minute } = parseAt(process.env.INVOICE_REMINDER_AT);

  const schedule = () => {
    const wait = msUntil(hour, minute);
    const timer = setTimeout(async () => {
      await runInvoiceReminder(secret);
      schedule();
    }, wait);
    // Que un timer pendiente no impida apagar el contenedor
    timer.unref?.();
    console.log(
      `[cron] invoice-reminder programado a las ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} UTC — próxima corrida en ${formatWait(wait)}`
    );
  };

  schedule();
}
