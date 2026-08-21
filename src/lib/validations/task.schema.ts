import { z } from "zod";
import { TEAM_SLUGS } from "@/lib/team";

export const taskSchema = z.object({
  assignee:    z.enum(TEAM_SLUGS),
  title:       z.string().min(1, "La tarea es requerida"),
  description: z.string().optional().or(z.literal("")),
  due_date:    z.string().optional().nullable().or(z.literal("")),
  status:      z.enum(["todo", "in_progress", "done"]),
});

export type TaskFormData = z.infer<typeof taskSchema>;
