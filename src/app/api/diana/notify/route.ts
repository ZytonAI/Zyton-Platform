import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Verificar secret interno
  const secret = request.headers.get("x-diana-secret");
  if (secret !== process.env.DIANA_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    task_id?: string;
    owner_id?: string;
    status?: "done" | "error";
    summary?: string;
  };

  if (!body.task_id || !body.owner_id || !body.status) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Actualizar la tarea en BD
  const { error: updateErr } = await supabase
    .from("diana_tasks")
    .update({
      status: body.status,
      result_summary: body.summary ?? null,
      notified: false,
      completed_at: new Date().toISOString(),
    })
    .eq("id", body.task_id)
    .eq("owner_id", body.owner_id);

  if (updateErr) {
    console.error("[diana/notify] Error actualizando tarea:", updateErr.message);
  }

  // Buscar el telegram_chat_id del usuario para notificación proactiva
  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", body.owner_id)
    .single();

  const chatId = profile?.telegram_chat_id;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (chatId && token && body.summary) {
    const emoji = body.status === "done" ? "✅" : "❌";
    const text = `${emoji} *Diana:* ${body.summary}`;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    }).catch(() => {});

    // Marcar como notificado
    await supabase
      .from("diana_tasks")
      .update({ notified: true })
      .eq("id", body.task_id);
  }

  return NextResponse.json({ ok: true });
}
