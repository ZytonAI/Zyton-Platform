export async function notifyDiana(
  baseUrl: string,
  taskId: string,
  ownerId: string,
  status: "done" | "error",
  summary: string
) {
  try {
    await fetch(`${baseUrl}/api/diana/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-diana-secret": process.env.DIANA_INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify({ task_id: taskId, owner_id: ownerId, status, summary }),
    });
  } catch {
    // No bloqueamos el flujo principal si la notificación falla
  }
}
