import { z } from "zod";

export const leadSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  company: z.string().optional().or(z.literal("")),
  status: z.enum(["new", "contacted", "scheduled", "qualified", "lost", "converted"]),
  source: z.string().optional().or(z.literal("")),
  priority: z.enum(["alta", "media", "baja"]).nullable().optional(),
  website: z.string().optional().or(z.literal("")),
  maps_url: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type LeadFormData = z.infer<typeof leadSchema>;
