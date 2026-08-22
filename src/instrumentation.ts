/**
 * Se ejecuta una sola vez cuando arranca el servidor Next (ver
 * node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
 *
 * Aquí se levanta el cron interno: en EasyPanel el contenedor vive 24/7, así
 * que la tarea diaria de facturas se programa sola y no depende de que haya
 * un scheduler configurado en el panel.
 */
export async function register() {
  // El runtime Edge no tiene timers de larga duración ni acceso a la red interna
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startCron } = await import("@/lib/cron");
  startCron();
}
