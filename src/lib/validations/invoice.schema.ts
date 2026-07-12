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

// Objeto base sin refine — necesario porque zod v4 no permite .partial()
// sobre un schema que ya tiene .refine() aplicado (lanza en runtime, no en
// tipos: "no me deja actualizar una factura" era este error silencioso).
const invoiceObjectSchema = z.object({
  title:                z.string().min(1, "El título es requerido"),
  amount:               z.number().positive("El monto debe ser mayor a 0"),
  category:             z.string().optional().or(z.literal("")),
  due_date:             z.string().min(1, "La fecha de pago es requerida"),
  status:               z.enum(["pending", "paid", "overdue"]),
  is_recurring:         z.boolean(),
  recurrence_interval:  z.enum(["weekly","biweekly","monthly","bimonthly","quarterly","semiannual","annual"]).nullable().optional(),
  client_id:            z.string().uuid().nullable().optional(),
  notes:                z.string().optional().or(z.literal("")),
});

const requiresIntervalWhenRecurring = (d: { is_recurring?: boolean; recurrence_interval?: string | null }) =>
  !d.is_recurring || !!d.recurrence_interval;

const recurringRefineOptions = {
  message: "Selecciona la frecuencia de repetición",
  path: ["recurrence_interval"],
};

// Creación (POST): todos los campos requeridos según el objeto base.
export const invoiceSchema = invoiceObjectSchema.refine(requiresIntervalWhenRecurring, recurringRefineOptions);

// Actualización (PATCH): campos opcionales. El refine se aplica DESPUÉS de
// .partial() (sobre el ZodObject, no sobre el ZodEffects) para que ambas
// operaciones sean válidas en runtime.
export const invoiceUpdateSchema = invoiceObjectSchema.partial().refine(requiresIntervalWhenRecurring, recurringRefineOptions);

export type InvoiceFormData = z.infer<typeof invoiceSchema>;
