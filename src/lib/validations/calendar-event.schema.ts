import { z } from "zod";

export const calendarEventSchema = z.object({
  title:       z.string().min(1, "El título es requerido"),
  event_date:  z.string(),
  type:        z.enum(["event", "task", "deadline"]),
  description: z.string().optional().or(z.literal("")),
  status:      z.enum(["pending", "done"]),
  lead_id:     z.string().uuid().optional().nullable(),
});

export type CalendarEventFormData = z.infer<typeof calendarEventSchema>;
