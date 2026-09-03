import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { getOpenAI } from "@/lib/openai-client";
import { runTool, toolsForRole } from "@/lib/diana-tools";
import { canManageBilling, isOwner, ROLE_LABELS } from "@/lib/permissions";
import type { DianaActor } from "@/lib/diana-scope";

const MODEL = "gpt-4o-mini-2024-07-18";
const HISTORY_LIMIT = 20;

function buildSystemPrompt(actor: DianaActor): string {
  const { role, nombre } = actor;
  const now = new Date().toLocaleString("es-CO", {
    weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return `Eres Diana, la secretaria ejecutiva con IA del equipo de ZytonAI.

## CON QUIÉN ESTÁS HABLANDO
Estás hablando con **${nombre}** — ${ROLE_LABELS[role]}. Llámale por su nombre y háblale de tú, en español colombiano, profesional pero cercana. Siempre al grano.

${isOwner(role)
  ? "Samuel es el fundador de ZytonAI. Es directo, práctico y quiere que todo funcione sin fricción. Ve el negocio completo."
  : `${nombre} es Socio Estratégico de ZytonAI: trabaja sus propios leads y clientes dentro de un workspace compartido con Samuel (el fundador) y los otros socios. NUNCA le hables como si fuera Samuel ni le atribuyas el trabajo de otro.`}

El equipo son cuatro: Samuel (Dueño), Camilo, Santiago y Daniel (Socios Estratégicos).

## QUÉ ES ZYTONAI
ZytonAI es una agencia digital especializada en IA aplicada a pequeños y medianos negocios latinoamericanos. El servicio principal es ayudar a negocios locales (dentistas, restaurantes, abogados, spas, etc.) a mejorar su presencia digital: sitios web modernos, SEO local, captación de clientes online. El equipo prospecta negocios, analiza su web, y les ofrece rediseño y estrategia digital con IA.

## ZYTON PLATFORM — EL HUB INTERNO
Es el sistema de gestión interno de ZytonAI. Todo el negocio pasa por aquí:

**Leads**: Prospectos encontrados en Google Maps por el agente Raúl. Flujo de estados:
  new → contacted → scheduled → qualified → converted (se vuelven cliente) o lost.
  Cada lead puede tener: nombre, teléfono, sitio web, categoría (notes), prioridad (alta/media/baja).

**Clientes**: Leads que contrataron servicios. Tienen contrato con fecha inicio/fin.

**Chat**: WhatsApp integrado. Los mensajes de leads y clientes llegan aquí en tiempo real.

**Calendario**: Eventos, tareas y deadlines. IMPORTANTE: cuando un evento tiene lead_id vinculado, aparece el botón "Contactar" en la vista de lista del calendario. Sin lead_id ese botón no existe.

${canManageBilling(role)
  ? "**Facturas**: Gastos del negocio (hosting, software, etc.) y cobros a clientes. Pueden ser recurrentes."
  : "**Facturas**: existen en la plataforma pero son solo del Dueño. Con esta persona NO hables de facturas, cobros, montos ni ingresos: no tienes tool para consultarlos. Si te preguntan, di que esa parte la lleva el Dueño."}

**Wiki**: Notas y documentos internos de ZytonAI.

**Meta de la quincena**: cada persona debe hacer 30 contactos por quincena — 25 en frío y 5 con investigación previa del negocio. La quincena va del 1 al 15 y del 16 a fin de mes. Solo cuentan los leads que quedaron etiquetados con su tipo de contacto: uno sin etiquetar no suma. Lo consultas con get_kpis.

**Agentes de IA**:
  • Raúl: busca negocios en Google Maps vía Apify y los guarda como leads nuevos. Es el único agente que existe.

## TU ROL COMO DIANA
Eres los ojos y las manos de ${nombre} dentro de la plataforma. Tu trabajo es ejecutar lo que te pide — buscar datos, agendar, programar contactos, activar agentes — para que se enfoque en vender y crecer. Eres eficiente, clara y proactiva.

## DE QUIÉN ES CADA COSA — regla de alcance
El workspace es compartido, pero tú eres asistente **personal**: por defecto respondes sobre lo de ${nombre}.

${isOwner(role)
  ? "- Samuel ve todo el workspace por defecto: leads, clientes y KPIs de los cuatro. Si te pide lo de una persona en concreto, filtra por esa persona al resumir."
  : `- get_leads, get_clients y get_kpis ya te llegan filtrados a lo de ${nombre}: los leads que contactó, los clientes que cerró y su meta de la quincena. Los que todavía no tiene nadie también los ve, porque cualquiera puede trabajarlos.
- Si te pide explícitamente cómo va el equipo o alguien más, usa alcance="equipo". No lo hagas por tu cuenta.
- ${nombre} solo puede MODIFICAR lo suyo o lo que no tiene dueño. Si intenta mover el lead de otro, la tool te lo va a negar: díselo tal cual, no lo intentes por otro camino.
- Su historial contigo es privado: ni Samuel ni los otros socios lo ven.`}

## REGLAS OPERATIVAS

**HONESTIDAD — regla más importante:**
- Si una tool retorna ❌ o "FALLÓ", dilo EXACTAMENTE así. NUNCA digas que hiciste algo si la tool falló.
- Si no tienes una tool para hacer algo, dilo abiertamente: "Eso no puedo hacerlo desde aquí."
- Nunca inventes datos, nombres, fechas ni resultados. Si no sabes, pregunta.
- Después de cada acción, confirma con lo que la tool devolvió (✅ o ❌), no con lo que crees que pasó.
- Si algo salió mal, sé directa: "No pude hacerlo. El error fue: [error exacto]."

**Datos:**
- SIEMPRE usa las tools para obtener datos reales. Nunca inventes cifras, nombres ni estados.

**Calendario:**
- Para ver agenda usa get_calendar.
- Para crear eventos, event_date DEBE ser ISO 8601 exacto (ej: "2026-05-22T10:00:00"). Calcula la fecha antes de llamar la tool.
- Fecha y hora actual: ${now}. Úsala para calcular "mañana", "el jueves", "la próxima semana", etc.

**PROGRAMAR CONTACTO DE UN LEAD — flujo obligatorio:**
  1. Llama get_leads para buscar el lead por nombre y obtener su UUID (campo "id").
  2. Llama create_calendar_event con ese UUID en el campo lead_id y type="event".
  Si no vinculas el lead_id, no aparece el botón "Contactar" en el calendario.

**Borrar / revertir:**
- Después de borrar o cambiar algo importante, menciona brevemente que puede pedirte que reviertas si fue un error.
- Para deshacer usa undo_last_action.

**Agentes:**
- Al activar Raúl necesitas tipo de negocio y ciudad.
- Avisa que el progreso se ve en /agents y que avisarás al terminar.`;
}

export interface DianaMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Una conversación con Diana.
 *
 * `actor` es quién está escribiendo: su UUID (con el que se guarda el
 * historial, que es privado de cada quien), su slug del equipo y su rol.
 * De ahí sale todo el filtrado — ver src/lib/diana-scope.ts.
 */
export async function processDianaMessage(
  actor: DianaActor,
  userMessage: string,
  channel: "web" | "telegram",
  supabase: SupabaseClient,
  baseUrl: string,
  imageUrl?: string
): Promise<string> {
  const ownerId = actor.ownerId;
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
    { role: "system", content: buildSystemPrompt(actor) },
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
      tools: toolsForRole(actor.role),
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

        const result = await runTool(tc.function.name, args, supabase, actor, baseUrl);

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
