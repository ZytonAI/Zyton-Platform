import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

// ── Tool definitions for OpenAI function calling ──────────────────────────────

export const DIANA_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_leads",
      description:
        "Consulta los leads del CRM con filtros opcionales. Úsala para responder preguntas sobre leads, listarlos, o identificar cuáles tienen o no tienen web, por estado, prioridad, etc.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["new", "contacted", "scheduled", "qualified", "lost", "converted"],
            description: "Filtrar por estado del lead",
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
        "Retorna los KPIs generales del negocio: total de leads, convertidos, tasa de conversión, clientes activos, mensajes de WhatsApp.",
      parameters: { type: "object", properties: {}, required: [] },
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
      description: "Retorna los clientes del negocio con su estado y detalles de contrato.",
      parameters: {
        type: "object",
        properties: {
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
            enum: ["new", "contacted", "scheduled", "qualified", "lost", "converted"],
            description: "Nuevo estado",
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
        "Activa uno de los agentes automatizados: Raúl (busca leads en Google Maps), Elisa (analiza webs de leads), Davoo (genera prompts de diseño web). La tarea corre en segundo plano y Diana te notificará cuando termine.",
      parameters: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            enum: ["raul", "elisa", "davoo"],
            description: "Agente a activar",
          },
          tipo: {
            type: "string",
            description: "Solo para Raúl: tipo de negocio a buscar (ej: 'dentistas')",
          },
          ciudad: {
            type: "string",
            description: "Solo para Raúl: ciudad donde buscar (ej: 'Medellín Colombia')",
          },
        },
        required: ["agent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_tasks",
      description:
        "Consulta las tareas de agentes activadas por Diana: cuáles están corriendo, cuáles terminaron.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  ownerId: string,
  baseUrl: string
): Promise<string> {
  try {
    switch (name) {
      case "get_leads": {
        let query = supabase
          .from("leads")
          .select("id,name,phone,email,company,status,priority,source,website,analyzed,created_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(Math.min(Number(args.limit ?? 20), 50));

        if (args.status) query = query.eq("status", args.status as string);
        if (args.priority) query = query.eq("priority", args.priority as string);
        if (args.source) query = query.eq("source", args.source as string);
        if (args.has_website === true)
          query = query.not("website", "is", null).neq("website", "Sin página web");
        if (args.has_website === false)
          query = query.or("website.is.null,website.eq.Sin página web");

        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      case "get_kpis": {
        const [leadsRes, clientsRes, messagesRes] = await Promise.all([
          supabase
            .from("leads")
            .select("status")
            .eq("owner_id", ownerId),
          supabase
            .from("clients")
            .select("status")
            .eq("owner_id", ownerId),
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", ownerId),
        ]);

        const leads = leadsRes.data ?? [];
        const total = leads.length;
        const converted = leads.filter((l) => l.status === "converted").length;
        const rate = total > 0 ? Math.round((converted / total) * 100) : 0;
        const activeClients = (clientsRes.data ?? []).filter((c) => c.status === "active").length;

        return JSON.stringify({
          total_leads: total,
          leads_convertidos: converted,
          tasa_conversion: `${rate}%`,
          clientes_activos: activeClients,
          total_mensajes_whatsapp: messagesRes.count ?? 0,
        });
      }

      case "get_calendar": {
        let query = supabase
          .from("calendar_events")
          .select("id,title,event_date,type,description,status,lead_id")
          .eq("owner_id", ownerId)
          .order("event_date", { ascending: true })
          .limit(Math.min(Number(args.limit ?? 10), 30));

        if (args.status) query = query.eq("status", args.status as string);

        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      case "get_clients": {
        let query = supabase
          .from("clients")
          .select("id,name,email,phone,company,status,contract_start,contract_end")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false });

        if (args.status) query = query.eq("status", args.status as string);

        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      case "get_invoices": {
        let query = supabase
          .from("invoices")
          .select("id,title,amount,category,due_date,status,is_recurring")
          .eq("owner_id", ownerId)
          .order("due_date", { ascending: true });

        if (args.status) query = query.eq("status", args.status as string);

        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      case "create_calendar_event": {
        const row: Record<string, unknown> = {
          owner_id: ownerId,
          title: args.title,
          event_date: args.event_date,
          type: args.type ?? "event",
          description: args.description ?? null,
          lead_id: args.lead_id ?? null,
          status: "pending",
        };

        const { data, error } = await supabase
          .from("calendar_events")
          .insert(row)
          .select()
          .single();

        if (error) return `Error creando evento: ${error.message}`;

        // Si hay lead_id, actualizar estado a 'scheduled'
        if (args.lead_id) {
          await supabase
            .from("leads")
            .update({ status: "scheduled" })
            .eq("id", args.lead_id)
            .eq("owner_id", ownerId)
            .not("status", "in", '("lost","converted")');
        }

        return JSON.stringify({ success: true, event: data });
      }

      case "update_lead_status": {
        const ids = args.lead_ids as string[];
        if (!ids?.length) return "No se proporcionaron IDs de leads";

        const { error, count } = await supabase
          .from("leads")
          .update({ status: args.status })
          .in("id", ids)
          .eq("owner_id", ownerId);

        if (error) return `Error: ${error.message}`;
        return JSON.stringify({ success: true, updated: count ?? ids.length });
      }

      case "activate_agent": {
        const agent = args.agent as string;
        const params: Record<string, string> = {};
        if (agent === "raul") {
          if (!args.tipo || !args.ciudad)
            return "Para activar a Raúl necesito el tipo de negocio y la ciudad.";
          params.tipo = args.tipo as string;
          params.ciudad = args.ciudad as string;
        }

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
          elisa: `${baseUrl}/api/agents/elisa`,
          davoo: `${baseUrl}/api/agents/davoo`,
        };

        // Llamamos al agente con el taskId para que pueda notificar cuando termine
        fetch(agentUrls[agent], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...params, diana_task_id: task.id }),
        }).catch(() => {});

        const agentNames: Record<string, string> = {
          raul: "Raúl",
          elisa: "Elisa",
          davoo: "Davoo",
        };

        return JSON.stringify({
          success: true,
          task_id: task.id,
          message: `${agentNames[agent]} fue activado y está corriendo en segundo plano.`,
        });
      }

      case "get_pending_tasks": {
        const { data, error } = await supabase
          .from("diana_tasks")
          .select("id,agent,status,params,result_summary,created_at,completed_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data ?? []);
      }

      default:
        return `Tool desconocida: ${name}`;
    }
  } catch (err) {
    return `Error ejecutando tool: ${err instanceof Error ? err.message : String(err)}`;
  }
}
