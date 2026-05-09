import { z } from "zod";

export const invoiceSchema = z.object({
  title:    z.string().min(1, "El título es requerido"),
  amount:   z.coerce.number().positive("El monto debe ser mayor a 0"),
  category: z.string().optional().or(z.literal("")),
  due_date: z.string().min(1, "La fecha de pago es requerida"),
  status:   z.enum(["pending", "paid", "overdue"]),
  notes:    z.string().optional().or(z.literal("")),
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;
