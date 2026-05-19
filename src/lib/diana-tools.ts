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
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const limit = Math.min(Number(args.limit ?? 20), 50);

        // Intentar con filtro soft-delete; si falla el schema cache, reintentar sin él
        let data: Record<string, unknown>[] | null = null;
        let error: { message: string } | null = null;

        const baseQuery = () =>
          supabase
            .from("calendar_events")
            .select("id,title,event_date,type,description,status")
            .eq("owner_id", ownerId)
            .gte("event_date", now.toISOString())
            .order("event_date", { ascending: true })
            .limit(limit);

        const res1 = await baseQuery().is("deleted_at", null);
        if (res1.error?.message?.includes("deleted_at")) {
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
        // Normalizar la fecha — aceptar ISO o cualquier string parseable
        let eventDate: string;
        try {
          const d = new Date(args.event_date as string);
          if (isNaN(d.getTime())) throw new Error("Fecha inválida");
          eventDate = d.toISOString();
        } catch {
          return `No pude interpretar la fecha "${args.event_date}". Usa formato ISO como "2026-05-22T10:00:00".`;
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
            .eq("id", args.lead_id as string)
            .eq("owner_id", ownerId);
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
        const { data: oldLeads } = await supabase
          .from("leads")
          .select("id,name,status")
          .in("id", ids)
          .eq("owner_id", ownerId);

        const { error, count } = await supabase
          .from("leads")
          .update({ status: args.status })
          .in("id", ids)
          .eq("owner_id", ownerId);

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

      case "delete_calendar_event": {
        const eventId = args.event_id as string;
        if (!eventId) return "No se proporcionó el ID del evento.";

        // Leer el evento antes de borrarlo para poder revertir
        const { data: eventData } = await supabase
          .from("calendar_events")
          .select("*")
          .eq("id", eventId)
          .eq("owner_id", ownerId)
          .single();

        if (!eventData) return "No encontré ese evento o no tienes permiso para borrarlo.";

        // Soft delete: marcar deleted_at en lugar de borrar
        const { error } = await supabase
          .from("calendar_events")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", eventId)
          .eq("owner_id", ownerId);

        if (error) {
          if (error.message.includes("deleted_at")) {
            const { error: hardErr } = await supabase
              .from("calendar_events")
              .delete()
              .eq("id", eventId)
              .eq("owner_id", ownerId);
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
            .eq("id", lastAction.entity_id)
            .eq("owner_id", ownerId);
          if (error) return `❌ FALLÓ restaurar evento: ${error.message}`;
          revertMsg = `✅ Restauré el evento "${lastAction.old_data?.title}".`;

        } else if (lastAction.action_type === "create_event") {
          const { error } = await supabase
            .from("calendar_events")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", lastAction.entity_id)
            .eq("owner_id", ownerId);
          if (error) return `❌ FALLÓ deshacer creación: ${error.message}`;
          revertMsg = `✅ Eliminé el evento "${lastAction.new_data?.title}" que acababa de crear.`;

        } else if (lastAction.action_type === "update_lead_status") {
          const oldLeads = lastAction.old_data?.leads as { id: string; status: string }[] ?? [];
          let failCount = 0;
          for (const lead of oldLeads) {
            const { error } = await supabase
              .from("leads")
              .update({ status: lead.status })
              .eq("id", lead.id)
              .eq("owner_id", ownerId);
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
