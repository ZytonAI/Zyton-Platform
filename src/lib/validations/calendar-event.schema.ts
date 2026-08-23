import { z } from "zod";
import { conHoraDeColombia } from "@/lib/event-time";

export const calendarEventSchema = z.object({
  title:       z.string().min(1, "El título es requerido"),
  event_date:  z.string().min(1, "La fecha es requerida").transform(conHoraDeColombia),
  type:        z.enum(["event", "task", "deadline"]),
  description: z.string().optional().or(z.literal("")),
  status:      z.enum(["pending", "done"]),
  // personal = solo lo ve quien lo crea; team = todo el equipo.
  // Opcional: si no viene, manda el DEFAULT 'team' de la tabla (así los
  // eventos que agenda LeadsClient siguen siendo del equipo sin tocar nada).
  visibility:  z.enum(["team", "personal"]).optional(),
  lead_id:     z.string().uuid().optional().nullable(),
});

export type CalendarEventFormData = z.infer<typeof calendarEventSchema>;
