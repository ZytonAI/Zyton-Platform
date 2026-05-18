import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { getOpenAI } from "@/lib/openai-client";
import { DIANA_TOOLS, runTool } from "@/lib/diana-tools";

const MODEL = "gpt-4o-mini-2024-07-18";
const HISTORY_LIMIT = 20;

const SYSTEM_PROMPT = `Eres Diana, la secretaria ejecutiva de IA de ZytonAI. Eres inteligente, proactiva y hablas en español latinoamericano con un tono profesional pero cercano.

Tu trabajo es ayudar a Samuel a gestionar toda su empresa desde esta plataforma. Tienes acceso a:
- Los leads del CRM (puedes listarlos, filtrarlos, cambiar su estado)
- El calendario (puedes ver eventos y agendar nuevos)
- Los clientes activos
- Las facturas y gastos
- Los KPIs del negocio (tasa de conversión, etc.)
- Los agentes automatizados: Raúl (busca leads en Google Maps), Elisa (analiza webs) y Davoo (genera prompts de diseño)

Reglas importantes:
- Cuando necesites datos, SIEMPRE usa las tools disponibles. No inventes datos.
- Cuando el usuario pida agendar algo, usa create_calendar_event con la fecha correcta.
- Cuando actives un agente, avisa que puede ver el progreso en la sección de Agentes (/agents) y que te notificará cuando termine.
- Sé concisa en tus respuestas. Ve al grano.
- Si el usuario pregunta por leads sin web para contactar, filtra con has_website=false.
- La fecha de hoy es: ${new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
- Si el usuario dice "el jueves" o "mañana", calcula la fecha correcta basándote en la fecha de hoy.`;

export interface DianaMessage {
  role: "user" | "assistant";
  content: string;
}

export async function processDianaMessage(
  ownerId: string,
  userMessage: string,
  channel: "web" | "telegram",
  supabase: SupabaseClient,
  baseUrl: string
): Promise<string> {
  // 1. Cargar historial reciente
  const { data: history } = await supabase
    .from("diana_messages")
    .select("role, content")
    .eq("owner_id", ownerId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const pastMessages: DianaMessage[] = (history ?? []).reverse();

  // 2. Guardar el mensaje del usuario
  await supabase.from("diana_messages").insert({
    owner_id: ownerId,
    channel,
    role: "user",
    content: userMessage,
  });

  // 3. Construir el array de mensajes para OpenAI
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...pastMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  // 4. Loop de tool calling
  const openai = getOpenAI();
  let reply = "";

  for (let i = 0; i < 8; i++) {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: DIANA_TOOLS,
      tool_choice: "auto",
      temperature: 0.4,
    });

    const choice = response.choices[0];
    const msg = choice.message;

    // Si hay tool calls, ejecutarlos
    if (msg.tool_calls?.length) {
      messages.push(msg);

      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }

        const result = await runTool(tc.function.name, args, supabase, ownerId, baseUrl);

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
      continue;
    }

    // Respuesta final
    reply = msg.content ?? "";
    break;
  }

  if (!reply) reply = "Lo siento, no pude procesar tu solicitud. Inténtalo de nuevo.";

  // 5. Guardar respuesta de Diana
  await supabase.from("diana_messages").insert({
    owner_id: ownerId,
    channel,
    role: "assistant",
    content: reply,
  });

  return reply;
}
