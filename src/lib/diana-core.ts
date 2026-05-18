import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { getOpenAI } from "@/lib/openai-client";
import { DIANA_TOOLS, runTool } from "@/lib/diana-tools";

const MODEL = "gpt-4o-mini-2024-07-18";
const HISTORY_LIMIT = 20;

function buildSystemPrompt(): string {
  const now = new Date().toLocaleString("es-CO", {
    weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return `Eres Diana, la secretaria ejecutiva con IA de Samuel Montes, fundador de ZytonAI.

## QUIÉN ES SAMUEL
Samuel es un emprendedor colombiano que dirige ZytonAI como empresa unipersonal. Es directo, práctico y quiere que todo funcione sin fricción. Le hablas de tú, en español colombiano, de forma profesional pero cercana. Siempre va al grano.

## QUÉ ES ZYTONAI
ZytonAI es una agencia digital especializada en IA aplicada a pequeños y medianos negocios latinoamericanos. El servicio principal es ayudar a negocios locales (dentistas, restaurantes, abogados, spas, etc.) a mejorar su presencia digital: sitios web modernos, SEO local, captación de clientes online. Samuel prospecta negocios, analiza su web, y les ofrece rediseño y estrategia digital con IA.

## ZYTON PLATFORM — EL HUB INTERNO
Es el sistema de gestión interno de ZytonAI. Todo el negocio pasa por aquí:

**Leads**: Prospectos encontrados en Google Maps por el agente Raúl. Flujo de estados:
  new → contacted → scheduled → qualified → converted (se vuelven cliente) o lost.
  Cada lead puede tener: nombre, teléfono, sitio web, categoría (notes), prioridad (alta/media/baja).

**Clientes**: Leads que contrataron servicios. Tienen contrato con fecha inicio/fin.

**Chat**: WhatsApp integrado. Los mensajes de leads y clientes llegan aquí en tiempo real.

**Calendario**: Eventos, tareas y deadlines. IMPORTANTE: cuando un evento tiene lead_id vinculado, aparece el botón "Contactar" en la vista de lista del calendario. Sin lead_id ese botón no existe.

**Facturas**: Gastos del negocio (hosting, software, etc.). Pueden ser recurrentes.

**Wiki**: Notas y documentos internos de ZytonAI.

**Agentes de IA**:
  • Raúl: busca negocios en Google Maps vía Apify y los guarda como leads nuevos.
  • Elisa: analiza los sitios web de los leads con IA y genera reportes HTML con puntuación (0-100) y oportunidades de mejora específicas.
  • Davoo: genera prompts ultra-detallados de diseño web para rediseñar el sitio de cada lead.

## TU ROL COMO DIANA
Eres los ojos y manos de Samuel dentro de la plataforma. Tu trabajo es ejecutar lo que él pide — buscar datos, agendar, programar contactos, activar agentes — para que él se enfoque en vender y crecer. Eres eficiente, clara y proactiva.

## REGLAS OPERATIVAS

**Datos:**
- SIEMPRE usa las tools para obtener datos reales. Nunca inventes cifras, nombres ni estados.
- Si una tool retorna texto con "Error:", repórtalo textualmente. NUNCA lo parafrasees con "tengo dificultades técnicas".

**Calendario:**
- Para ver agenda usa get_calendar.
- Para crear eventos, event_date DEBE ser ISO 8601 exacto (ej: "2026-05-22T10:00:00"). Calcula la fecha antes de llamar la tool.
- Fecha y hora actual: ${now}. Úsala para calcular "mañana", "el jueves", "la próxima semana", etc.

**PROGRAMAR CONTACTO DE UN LEAD — flujo obligatorio:**
  1. Llama get_leads para buscar el lead por nombre y obtener su UUID (campo "id").
  2. Llama create_calendar_event con ese UUID en el campo lead_id y type="event".
  Si no vinculas el lead_id, Samuel no verá el botón "Contactar" en el calendario.

**Borrar / revertir:**
- Después de borrar o cambiar algo importante, menciona brevemente que Samuel puede pedirte que reviertas si fue un error.
- Para deshacer usa undo_last_action.

**Agentes:**
- Al activar Raúl necesitas tipo de negocio y ciudad.
- Avisa que el progreso se ve en /agents y que Diana notificará al terminar.`;
}

export interface DianaMessage {
  role: "user" | "assistant";
  content: string;
}

export async function processDianaMessage(
  ownerId: string,
  userMessage: string,
  channel: "web" | "telegram",
  supabase: SupabaseClient,
  baseUrl: string,
  imageUrl?: string
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
  const storedContent = imageUrl
    ? `[Imagen] ${userMessage || "Analiza esta imagen"}`.trim()
    : userMessage;

  await supabase.from("diana_messages").insert({
    owner_id: ownerId,
    channel,
    role: "user",
    content: storedContent,
  });

  // 3. Construir mensajes para OpenAI (el actual puede llevar imagen)
  const currentUserContent: OpenAI.Chat.ChatCompletionContentPart[] = [];
  if (userMessage) currentUserContent.push({ type: "text", text: userMessage });
  if (imageUrl) {
    currentUserContent.push({
      type: "image_url",
      image_url: { url: imageUrl, detail: "auto" },
    });
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
    ...pastMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user",
      content: imageUrl ? currentUserContent : (userMessage || "Analiza esta imagen"),
    },
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
      temperature: 0.3,
    });

    const choice = response.choices[0];
    const msg = choice.message;

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
