import { z } from "zod";
import { TEAM_SLUGS } from "@/lib/team";
import { CONTACT_TYPE_VALUES } from "@/lib/kpi";

/** Etiqueta de persona: slug del equipo, o null si nadie la tiene asignada */
const memberTag = z.enum(TEAM_SLUGS).nullable().optional();

export const leadSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  company: z.string().optional().or(z.literal("")),
  status: z.enum(["new", "contacted", "follow_up", "scheduled", "qualified", "lost", "converted"]),
  source: z.string().optional().or(z.literal("")),
  priority: z.enum(["alta", "media", "baja"]).nullable().optional(),
  website: z.string().optional().or(z.literal("")),
  maps_url: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  // Cómo fue el contacto: en frío o con investigación previa del negocio.
  // Es lo que alimenta el KPI de la quincena (src/lib/kpi.ts).
  contact_type: z.enum(CONTACT_TYPE_VALUES).nullable().optional(),
  // Etiquetas de equipo — quién hizo qué con este lead
  contacted_by: memberTag,
  closed_by: memberTag,
  scheduled_by: memberTag,
});

export type LeadFormData = z.infer<typeof leadSchema>;
