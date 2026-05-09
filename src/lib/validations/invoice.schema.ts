import { z } from "zod";

export const RECURRENCE_INTERVALS = [
  { value: "weekly",     label: "Semanal" },
  { value: "biweekly",   label: "Quincenal" },
  { value: "monthly",    label: "Mensual" },
  { value: "bimonthly",  label: "Bimestral" },
  { value: "quarterly",  label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual",     label: "Anual" },
] as const;

export const invoiceSchema = z.object({
  title:                z.string().min(1, "El título es requerido"),
  amount:               z.number().positive("El monto debe ser mayor a 0"),
  category:             z.string().optional().or(z.literal("")),
  due_date:             z.string().min(1, "La fecha de pago es requerida"),
  status:               z.enum(["pending", "paid", "overdue"]),
  is_recurring:         z.boolean(),
  recurrence_interval:  z.enum(["weekly","biweekly","monthly","bimonthly","quarterly","semiannual","annual"]).nullable().optional(),
  notes:                z.string().optional().or(z.literal("")),
}).refine(
  (d: { is_recurring: boolean; recurrence_interval?: string | null }) =>
    !d.is_recurring || !!d.recurrence_interval,
  { message: "Selecciona la frecuencia de repetición", path: ["recurrence_interval"] }
);

export type InvoiceFormData = z.infer<typeof invoiceSchema>;
