import { z } from "zod";

export const BILLING_TYPES = [
  { value: "monthly",  label: "Mensual" },
  { value: "one_time", label: "Pago único" },
] as const;

// Objeto base sin refine — necesario porque zod v4 no permite .partial()
// sobre un schema que ya tiene .refine() aplicado.
const clientObjectSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  company: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "churned"]),
  contract_start: z.string().optional().or(z.literal("")),
  contract_end: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  // Cómo se le cobra al cliente — null/undefined si no tiene cobro configurado.
  // Cuando se define, genera (o sincroniza) automáticamente una factura de
  // tipo "cobro" ligada a este cliente.
  billing_type: z.enum(["monthly", "one_time"]).nullable().optional(),
  billing_amount: z.number().positive("El monto debe ser mayor a 0").nullable().optional(),
});

const requiresAmountWhenBilling = (d: { billing_type?: string | null; billing_amount?: number | null }) =>
  !d.billing_type || (d.billing_amount != null && d.billing_amount > 0);

const billingRefineOptions = {
  message: "Ingresa el monto del cobro",
  path: ["billing_amount"],
};

// Creación (POST): todos los campos requeridos según el objeto base.
export const clientSchema = clientObjectSchema.refine(requiresAmountWhenBilling, billingRefineOptions);

// Actualización (PATCH): campos opcionales.
export const clientUpdateSchema = clientObjectSchema.partial().refine(requiresAmountWhenBilling, billingRefineOptions);

export type ClientFormData = z.infer<typeof clientSchema>;
