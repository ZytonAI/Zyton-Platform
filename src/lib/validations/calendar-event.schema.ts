import { z } from "zod";

export const calendarEventSchema = z.object({
  title:       z.string().min(1, "El título es requerido"),
  event_date:  z.string(), // validated manually in EventForm (date + optional time)
  type:        z.enum(["event", "task", "deadline"]),
  description: z.string().optional().or(z.literal("")),
  status:      z.enum(["pending", "done"]),
});

export type CalendarEventFormData = z.infer<typeof calendarEventSchema>;
