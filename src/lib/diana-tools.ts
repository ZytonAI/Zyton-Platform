import type { SupabaseClient } from "@supabase/supabase-js";
import { conHoraDeColombia, fechaHoyColombia } from "@/lib/event-time";
import type OpenAI from "openai";
import { canManageBilling, type Role } from "@/lib/permissions";
import {
  filtroMio,
  leeTodo,
  puedeTocar,
  puedeTocarEvento,
  type Alcance,
  type DianaActor,
} from "@/lib/diana-scope";
import { kpiPorPersona, META_QUINCENA, quincenaActual } from "@/lib/kpi";
import type { MemberTag } from "@/types";

/** Parámetro común de las tools de lectura: lo mío o lo de todos. */
const ALCANCE_PARAM = {
  type: "string",
  enum: ["mios", "equipo"],
  description:
    "'mios' (default) trae solo lo que le toca a la persona con la que hablas. Usa 'equipo' SOLO si pide explícitamente el consolidado del equipo o lo de otra persona.",
} as const;

// ── Tool definitions for OpenAI function calling ──────────────────────────────

/** Tools que tocan dinero: solo el Dueño (ver src/lib/permissions.ts). */
const BILLING_TOOLS = new Set(["get_invoices"]);

const DIANA_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_leads",
      description:
        "Consulta los leads del CRM con filtros opcionales. Úsala para responder preguntas sobre leads, listarlos, o identificar cuáles tienen o no tienen web, por estado, prioridad, etc. Por defecto trae solo los leads de la persona con la que hablas (los que ella contactó, más los que no tiene nadie).",
      parameters: {
        type: "object",
        properties: {
          alcance: ALCANCE_PARAM,
          status: {
            type: "string",
            enum: ["new", "contacted", "follow_up", "scheduled", "qualified", "lost", "converted"],
            description: "Filtrar por estado del lead (follow_up = seguimiento pendiente)",
          },
          priority: {
            type: "string",
            enum: ["alta", "media", "baja"],
            description: "Filtrar por prioridad",
          },
          source: {
            type: "string",
            description: "Filtrar por fuente (ej: 'raul')",
          },
          has_website: {
            type: "boolean",
            description: "Si es true retorna solo leads con web; false solo sin web",
          },
          limit: {
            type: "number",
            description: "Máximo de resultados a retornar (default 20, máx 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kpis",
      description:
        "Retorna los KPIs: el avance de la meta de la quincena (55 contactos — 50 en frío y 5 con investigación), leads, tasa de conversión y clientes activos. Por defecto los de la persona con la que hablas; con alcance='equipo' trae el consolidado de los cuatro.",
      parameters: {
        type: "object",
        properties: { alcance: ALCANCE_PARAM },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar",
      description:
        "Retorna los próximos eventos del calendario. Útil para ver qué hay agendado, tareas pendientes o vencimientos.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "done"],
            description: "Filtrar por estado del evento",
          },
          limit: {
            type: "number",
            description: "Máximo de eventos a retornar (default 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clients",
      description:
        "Retorna los clientes del negocio con su estado y detalles de contrato. Por defecto solo los que cerró la persona con la que hablas, más los que no tienen dueño.",
      parameters: {
        type: "object",
        properties: {
          alcance: ALCANCE_PARAM,
          status: {
            type: "string",
            enum: ["active", "inactive", "churned"],
            description: "Filtrar por estado del cliente",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoices",
      description:
        "Retorna las facturas/gastos del negocio. Útil para ver pagos pendientes, vencidos o totales.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "paid", "overdue"],
            description: "Filtrar por estado",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description:
        "Crea un evento en el calendario. Si se proporciona lead_id, el lead automáticamente pasa a estado 'scheduled'. Úsala para agendar contactos, reuniones o tareas.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título del evento" },
          event_date: {
            type: "string",
            description: "Fecha y hora en formato ISO 8601 (ej: 2026-05-22T10:00:00)",
          },
          type: {
            type: "string",
            enum: ["event", "task", "deadline"],
            description: "Tipo de evento",
          },
          description: { type: "string", description: "Descripción opcional" },
          lead_id: {
            type: "string",
            description: "UUID del lead a vincular (opcional)",
          },
        },
        required: ["title", "event_date", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_status",
      description: "Cambia el estado de uno o varios leads.",
      parameters: {
        type: "object",
        properties: {
          lead_ids: {
            type: "array",
            items: { type: "string" },
            description: "Lista de UUIDs de los leads a actualizar",
          },
          status: {
            type: "string",
            enum: ["new", "contacted", "follow_up", "scheduled", "qualified", "lost", "converted"],
            description: "Nuevo estado (follow_up = seguimiento pendiente)",
          },
        },
        required: ["lead_ids", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "activate_agent",
      description:
        "Activa a Raúl, que busca negocios en Google Maps y los guarda como leads. La tarea corre en segundo plano y Diana te notificará cuando termine.",
      parameters: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            enum: ["raul"],
            description: "Agente a activar",
          },
          tipo: {
            type: "string",
            description: "Tipo de negocio a buscar (ej: 'dentistas')",
          },
          ciudad: {
            type: "string",
            description: "Ciudad donde buscar (ej: 'Medellín Colombia')",
          },
        },
        required: ["agent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_todo",
      description:
        "Consulta el tablero To Do: las tareas del equipo con su responsable, fecha y estado. Úsala SIEMPRE que pregunten por tareas, pendientes, qué falta por hacer o qué hay para hoy. Por defecto trae las pendientes de la persona con la que hablas.",
      parameters: {
        type: "object",
        properties: {
          alcance: ALCANCE_PARAM,
          incluir_completadas: {
            type: "boolean",
            description: "Si es true incluye también las ya completadas. Por defecto solo las pendientes.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_agent_runs",
      description:
        "Consulta las corridas de los agentes que Diana activó (Raúl buscando leads): cuáles están corriendo y cuáles terminaron. NO son las tareas del tablero To Do — para eso usa get_todo.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description:
        "Elimina (soft delete) un evento o tarea del calendario. El evento puede recuperarse con undo_last_action. Primero usa get_calendar para obtener el ID.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "UUID del evento a eliminar" },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "undo_last_action",
      description:
        "Revierte la última acción que Diana realizó (borrar evento, crear evento, cambiar estado de lead). Úsala cuando el usuario pida deshacer, revertir o recuperar algo.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

/**
 * Diana corre con el service client (se salta RLS), así que el rol se filtra
 * aquí: a un Socio Estratégico ni se le ofrecen las tools de cobros.
 */
export function toolsForRole(role: Role): OpenAI.Chat.ChatCompletionTool[] {
  if (canManageBilling(role)) return DIANA_TOOLS;
  return DIANA_TOOLS.filter(
    (t) => t.type !== "function" || !BILLING_TOOLS.has(t.function.name)
  );
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  actor: DianaActor,
  baseUrl: string
): Promise<string> {
  const ownerId = actor.ownerId;
  const alcance = args.alcance as Alcance | undefined;

  // Cinturón y tirantes: aunque la tool no se le haya ofrecido, si el modelo
  // la inventa no se ejecuta.
  if (BILLING_TOOLS.has(name) && !canManageBilling(actor.role)) {
    return "Sin acceso: los cobros son solo del Dueño.";
  }

  try {
    switch (name) {
      case "get_leads": {
        const todos = leeTodo(actor, alcance);

        let query = supabase
          .from("leads")
          .select(
            "id,name,phone,email,company,status,priority,source,website,analyzed,contacted_by,contact_type,contacted_at,created_at"
          )
          .order("created_at", { ascending: false })
          .limit(Math.min(Number(args.limit ?? 20), 50));

        // Diana se salta RLS (service role), así que el corte por persona va
        // aquí. Los leads sin etiquetar no son de nadie y los ve cualquiera.
        if (!todos) query = query.or(filtroMio("contacted_by", actor.slug));

        if (args.status) query = query.eq("status", args.status as string);
        if (args.priority) query = query.eq("priority", args.priority as string);
        if (args.source) query = query.eq("source", args.source as string);
        if (args.has_website === true)
          query = query.not("website", "is", null).neq("website", "Sin página web");
        if (args.has_website === false)
          query = query.or("website.is.null,website.eq.Sin página web");

        const { data, error } = await query;
        // Si la base todavía no tiene las columnas de etiqueta, no se puede
        // separar por persona: mejor no mostrar nada que mostrar lo ajeno.
        if (error && !todos && error.message.includes("contacted_by")) {
          return "No puedo separar los leads por persona todavía (falta correr la migración de etiquetas), así que prefiero no mostrarlos.";
        }
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      case "get_kpis": {
        const todos = leeTodo(actor, alcance);
        const q = quincenaActual();

        const [contactadosRes, leadsRes, clientsRes, messagesRes] = await Promise.all([
          // Lo que cuenta para la meta: contactados dentro de esta quincena
          supabase
            .from("leads")
            .select("contacted_by,contact_type")
            .gte("contacted_at", q.desde)
            .lt("contacted_at", q.hasta),
          supabase.from("leads").select("status,contacted_by"),
          supabase.from("clients").select("status,closed_by"),
          supabase.from("messages").select("id", { count: "exact", head: true }),
        ]);

        if (contactadosRes.error)
          return `Error consultando el KPI de la quincena: ${contactadosRes.error.message}`;
        if (leadsRes.error) return `Error: ${leadsRes.error.message}`;

        const quincena = {
          periodo: q.etiqueta,
          dias_restantes: q.diasRestantes,
          meta: { ...META_QUINCENA },
        };

        // Para el KPI, "míos" es estricto: un lead sin etiquetar no es de
        // nadie y no suma para ninguna meta (ver src/lib/kpi.ts).
        const crudas = kpiPorPersona(contactadosRes.data ?? []);
        const resumir = (f: (typeof crudas)[number]) => ({
          persona: f.member.name,
          contactos: f.total,
          frio: f.frio,
          investigado: f.investigado,
          sin_etiqueta: f.sinEtiqueta,
          avance: `${f.pct}%`,
          cumplida: f.cumplido,
          faltan_frio: Math.max(0, META_QUINCENA.frio - f.frio),
          faltan_investigado: Math.max(0, META_QUINCENA.investigado - f.investigado),
        });

        const leads = leadsRes.data ?? [];
        const clients = clientsRes.data ?? [];

        if (todos) {
          const total = leads.length;
          const converted = leads.filter((l) => l.status === "converted").length;
          const rate = total > 0 ? Math.round((converted / total) * 100) : 0;

          return JSON.stringify({
            quincena,
            meta_por_persona: crudas.map(resumir),
            workspace: {
              total_leads: total,
              leads_convertidos: converted,
              tasa_conversion: `${rate}%`,
              clientes_activos: clients.filter((c) => c.status === "active").length,
              total_mensajes_whatsapp: messagesRes.count ?? 0,
            },
          });
        }

        // Vista personal: solo su fila de la meta y sus propios números.
        const fila = crudas.find((f) => f.member.slug === actor.slug);
        const mia = fila ? resumir(fila) : null;
        const misLeads = leads.filter((l) => l.contacted_by === actor.slug);
        const misConvertidos = misLeads.filter((l) => l.status === "converted").length;
        const misClientes = clients.filter(
          (c) => c.closed_by === actor.slug && c.status === "active"
        ).length;

        return JSON.stringify({
          persona: actor.nombre,
          quincena,
          mi_meta: mia ?? "Sin contactos registrados en esta quincena.",
          mis_leads: {
            total: misLeads.length,
            convertidos: misConvertidos,
            tasa_conversion: misLeads.length
              ? `${Math.round((misConvertidos / misLeads.length) * 100)}%`
              : "0%",
          },
          mis_clientes_activos: misClientes,
        });
      }

      case "get_calendar": {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const limit = Math.min(Number(args.limit ?? 20), 50);

        // Intentar con filtro soft-delete; si falla el schema cache, reintentar sin él
        let data: Record<string, unknown>[] | null = null;
        let error: { message: string } | null = null;

        // Diana corre con service role (se salta RLS), así que el filtro de
        // eventos personales va aquí: los de otros no se le muestran.
        const baseQuery = () =>
          supabase
            .from("calendar_events")
            .select("id,title,event_date,type,description,status")
            .gte("event_date", now.toISOString())
            .or(`visibility.eq.team,owner_id.eq.${ownerId}`)
            .order("event_date", { ascending: true })
            .limit(limit);

        const res1 = await baseQuery().is("deleted_at", null);
        if (res1.error?.message?.includes("visibility")) {
          // Migración 018 sin aplicar — todos los eventos eran del equipo
          const res0 = await supabase
            .from("calendar_events")
            .select("id,title,event_date,type,description,status")
            .gte("event_date", now.toISOString())
            .order("event_date", { ascending: true })
            .limit(limit);
          data = res0.data as Record<string, unknown>[] | null;
          error = res0.error;
        } else if (res1.error?.message?.includes("deleted_at")) {
          // Columna no en schema cache aún — fallback sin filtro
          const res2 = await baseQuery();
          data = res2.data as Record<string, unknown>[] | null;
          error = res2.error;
        } else {
          data = res1.data as Record<string, unknown>[] | null;
          error = res1.error;
        }

        if (args.status && data) {
          data = data.filter((e) => e.status === args.status);
        }

        if (error) return `Error consultando calendario: ${error.message}`;
        if (!data || data.length === 0) return "No hay eventos próximos en el calendario.";
        return JSON.stringify(data);
      }

      case "get_clients": {
        const todos = leeTodo(actor, alcance);

        let query = supabase
          .from("clients")
          .select("id,name,email,phone,company,status,contract_start,contract_end,closed_by")
          .order("created_at", { ascending: false });

        // Ojo: las columnas de cobro (billing_*) nunca se piden aquí — no son
        // de este select y además son solo del Dueño (ver client-billing.ts).
        if (!todos) query = query.or(filtroMio("closed_by", actor.slug));

        if (args.status) query = query.eq("status", args.status as string);

        const { data, error } = await query;
        if (error && !todos && error.message.includes("closed_by")) {
          return "No puedo separar los clientes por persona todavía (falta correr la migración de etiquetas), así que prefiero no mostrarlos.";
        }
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      case "get_invoices": {
        let query = supabase
          .from("invoices")
          .select("id,title,amount,category,due_date,status,is_recurring")
          .order("due_date", { ascending: true });

        if (args.status) query = query.eq("status", args.status as string);

        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      case "create_calendar_event": {
        // Normalizar la fecha — aceptar ISO o cualquier string parseable
        let eventDate: string;
        try {
          // La hora que dice Diana es la de Colombia; sin ponerle el huso, el
          // servidor (que corre en UTC) la agendaba cinco horas antes.
          const d = new Date(conHoraDeColombia(args.event_date as string));
          if (isNaN(d.getTime())) throw new Error("Fecha inválida");
          eventDate = d.toISOString();
        } catch {
          return `No pude interpretar la fecha "${args.event_date}". Usa formato ISO como "2026-05-22T10:00:00".`;
        }

        // Vincular un lead lo mueve a "scheduled": es una escritura sobre el
        // lead, así que pide el mismo permiso que update_lead_status.
        if (args.lead_id) {
          const { data: lead, error: leadErr } = await supabase
            .from("leads")
            .select("id,name,contacted_by")
            .eq("id", args.lead_id as string)
            .maybeSingle();

          if (leadErr) return `❌ FALLÓ verificar el lead: ${leadErr.message}`;
          if (!lead) return `❌ No encontré el lead ${args.lead_id}.`;
          if (!puedeTocar(actor, (lead.contacted_by ?? null) as MemberTag)) {
            return `❌ No puedo agendar a "${lead.name}": ese lead lo trabaja otra persona. Puedo crear el evento sin vincularlo, o agendar uno de los tuyos.`;
          }
        }

        const row: Record<string, unknown> = {
          owner_id: ownerId,
          title: args.title,
          event_date: eventDate,
          type: args.type ?? "event",
          description: args.description ?? null,
          status: "pending",
        };
        // lead_id solo si fue proporcionado explícitamente
        if (args.lead_id) row.lead_id = args.lead_id;

        const { data, error } = await supabase
          .from("calendar_events")
          .insert(row)
          .select()
          .single();

        if (error) return `❌ FALLÓ crear evento: ${error.message}`;

        if (args.lead_id) {
          const { error: leadErr } = await supabase
            .from("leads")
            .update({ status: "scheduled" })
            .eq("id", args.lead_id as string);
          if (leadErr) return `✅ Evento creado pero ❌ FALLÓ actualizar el lead: ${leadErr.message}`;
        }

        await supabase.from("diana_action_log").insert({
          owner_id: ownerId,
          action_type: "create_event",
          entity_type: "calendar_event",
          entity_id: data.id,
          description: `Crear evento "${data.title}" el ${new Date(data.event_date).toLocaleDateString("es-CO")}`,
          new_data: data,
        });

        const leadNote = args.lead_id ? " (vinculado al lead, botón Contactar disponible)" : "";
        return `✅ Evento creado: "${data.title}" para el ${new Date(data.event_date).toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}${leadNote}. ID: ${data.id}`;
      }

      case "update_lead_status": {
        const ids = args.lead_ids as string[];
        if (!ids?.length) return "No se proporcionaron IDs de leads";

        // Guardar estado anterior para poder revertir
        const { data: oldLeads, error: readErr } = await supabase
          .from("leads")
          .select("id,name,status,contacted_by")
          .in("id", ids);

        // Diana se salta RLS: si no se puede comprobar de quién es cada lead,
        // no se toca ninguno. Fallar cerrado, no abierto.
        if (readErr) {
          return `❌ No pude verificar de quién son esos leads, así que no cambié nada: ${readErr.message}`;
        }

        const ajenos = (oldLeads ?? []).filter(
          (l) => !puedeTocar(actor, (l.contacted_by ?? null) as MemberTag)
        );
        if (ajenos.length) {
          const nombres = ajenos.map((l) => `"${l.name}"`).join(", ");
          return `❌ No puedo cambiar ${nombres}: ${ajenos.length === 1 ? "ese lead lo trabaja" : "esos leads los trabaja"} otra persona. Solo puedo mover los tuyos o los que todavía no tienen dueño.`;
        }

        const { error, count } = await supabase
          .from("leads")
          .update({ status: args.status })
          .in("id", ids);

        if (error) return `❌ FALLÓ cambiar estado de leads: ${error.message}`;

        const names = oldLeads?.map((l) => l.name).join(", ") ?? ids.join(", ");

        if (oldLeads?.length) {
          await supabase.from("diana_action_log").insert({
            owner_id: ownerId,
            action_type: "update_lead_status",
            entity_type: "lead",
            entity_id: ids.join(","),
            description: `Cambiar estado de "${names}" a "${args.status}"`,
            old_data: { leads: oldLeads },
            new_data: { status: args.status, ids },
          });
        }

        return `✅ Estado cambiado a "${args.status}" para: ${names} (${count ?? ids.length} lead(s) actualizados).`;
      }

      case "activate_agent": {
        const agent = args.agent as string;
        // Raúl es el único agente que queda; Elisa y Davoo se retiraron.
        if (agent !== "raul") return `No existe un agente llamado "${agent}". El único es Raúl.`;
        const params: Record<string, string> = {};
        if (!args.tipo || !args.ciudad)
          return "Para activar a Raúl necesito el tipo de negocio y la ciudad.";
        params.tipo = args.tipo as string;
        params.ciudad = args.ciudad as string;

        // Guardar la tarea en diana_tasks (usando service role no disponible aquí, usamos anon con RLS)
        const { data: task, error: taskErr } = await supabase
          .from("diana_tasks")
          .insert({ owner_id: ownerId, agent, status: "running", params })
          .select()
          .single();

        if (taskErr) return `Error registrando tarea: ${taskErr.message}`;

        // Disparar el agente en background (fire & forget via fetch)
        const agentUrls: Record<string, string> = {
          raul: `${baseUrl}/api/agents/raul`,
        };

        // Llamamos al agente con el taskId para que pueda notificar cuando termine
        fetch(agentUrls[agent], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...params, diana_task_id: task.id }),
        }).catch(() => {});

        const agentNames: Record<string, string> = {
          raul: "Raúl",
        };

        return JSON.stringify({
          success: true,
          task_id: task.id,
          message: `${agentNames[agent]} fue activado y está corriendo en segundo plano.`,
        });
      }

      case "get_agent_runs": {
        const { data, error } = await supabase
          .from("diana_tasks")
          .select("id,agent,status,params,result_summary,created_at,completed_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      case "get_todo": {
        // El tablero vive en `tasks` (migración 014) y es otra cosa que
        // `diana_tasks`, que son las corridas de Raúl. Antes Diana solo leía
        // esa segunda y respondía "no tienes nada pendiente" con total
        // seguridad a quien sí tenía tareas sin hacer.
        const todos = leeTodo(actor, alcance);

        // `tasks.assignee` es NOT NULL: aquí no existe el caso "sin dueño",
        // así que si no sabemos quién pregunta no se adivina.
        if (!todos && !actor.slug) {
          return "No puedo saber cuáles tareas son tuyas: tu usuario no está en la lista del equipo.";
        }

        let query = supabase
          .from("tasks")
          .select("id,title,description,assignee,due_date,status")
          .order("due_date", { ascending: true, nullsFirst: false });

        if (!todos) query = query.eq("assignee", actor.slug!);
        if (args.incluir_completadas !== true) query = query.neq("status", "done");

        const { data, error } = await query;
        if (error) return `Error consultando el tablero To Do: ${error.message}`;
        if (!data || data.length === 0) {
          return todos
            ? "El tablero no tiene tareas pendientes."
            : `${actor.nombre} no tiene tareas pendientes en el tablero.`;
        }

        const hoy = fechaHoyColombia();
        return JSON.stringify(
          data.map((t) => ({
            ...t,
            // Una tarea con fecha pasada y sin completar está vencida: en el
            // tablero se pinta en rojo y conviene que Diana lo diga igual.
            vencida: !!t.due_date && t.due_date < hoy && t.status !== "done",
          }))
        );
      }

      case "delete_calendar_event": {
        const eventId = args.event_id as string;
        if (!eventId) return "No se proporcionó el ID del evento.";

        // Leer el evento antes de borrarlo para poder revertir
        const { data: eventData } = await supabase
          .from("calendar_events")
          .select("*")
          .eq("id", eventId)
          .single();

        if (!eventData) return "No encontré ese evento o no tienes permiso para borrarlo.";

        // Los eventos del equipo los mueve cualquiera; los personales, solo
        // quien los creó — el mismo criterio que la RLS (migración 018).
        if (!puedeTocarEvento(actor, eventData)) {
          return "❌ Ese evento es personal de otra persona: no puedo borrarlo.";
        }

        // Soft delete: marcar deleted_at en lugar de borrar
        const { error } = await supabase
          .from("calendar_events")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", eventId);

        if (error) {
          if (error.message.includes("deleted_at")) {
            const { error: hardErr } = await supabase
              .from("calendar_events")
              .delete()
              .eq("id", eventId);
            if (hardErr) return `❌ FALLÓ eliminar evento: ${hardErr.message}`;
          } else {
            return `❌ FALLÓ eliminar evento: ${error.message}`;
          }
        }

        await supabase.from("diana_action_log").insert({
          owner_id: ownerId,
          action_type: "delete_event",
          entity_type: "calendar_event",
          entity_id: eventId,
          description: `Eliminar evento "${eventData.title}"`,
          old_data: eventData,
        });

        return `✅ Evento eliminado: "${eventData.title}". Si fue un error, dime "revierte" y lo restauro.`;
      }

      case "undo_last_action": {
        // Buscar la última acción no revertida
        const { data: lastAction, error: fetchErr } = await supabase
          .from("diana_action_log")
          .select("*")
          .eq("owner_id", ownerId)
          .is("reversed_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (fetchErr || !lastAction) return "❌ No hay acciones recientes que pueda revertir.";

        let revertMsg = "";

        if (lastAction.action_type === "delete_event") {
          const { error } = await supabase
            .from("calendar_events")
            .update({ deleted_at: null })
            .eq("id", lastAction.entity_id);
          if (error) return `❌ FALLÓ restaurar evento: ${error.message}`;
          revertMsg = `✅ Restauré el evento "${lastAction.old_data?.title}".`;

        } else if (lastAction.action_type === "create_event") {
          const { error } = await supabase
            .from("calendar_events")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", lastAction.entity_id);
          if (error) return `❌ FALLÓ deshacer creación: ${error.message}`;
          revertMsg = `✅ Eliminé el evento "${lastAction.new_data?.title}" que acababa de crear.`;

        } else if (lastAction.action_type === "update_lead_status") {
          const oldLeads = lastAction.old_data?.leads as { id: string; status: string }[] ?? [];
          let failCount = 0;
          for (const lead of oldLeads) {
            const { error } = await supabase
              .from("leads")
              .update({ status: lead.status })
              .eq("id", lead.id);
            if (error) failCount++;
          }
          if (failCount > 0) return `❌ FALLÓ revertir ${failCount} de ${oldLeads.length} leads.`;
          revertMsg = `✅ Revertí el estado de ${oldLeads.length} lead(s) al estado anterior.`;

        } else {
          return `❌ No sé cómo revertir una acción de tipo "${lastAction.action_type}".`;
        }

        await supabase
          .from("diana_action_log")
          .update({ reversed_at: new Date().toISOString() })
          .eq("id", lastAction.id);

        return revertMsg;
      }

      default:
        return `Tool desconocida: ${name}`;
    }
  } catch (err) {
    return `Error ejecutando tool: ${err instanceof Error ? err.message : String(err)}`;
  }
}
