import { Badge } from "@/components/ui/badge";
import type { LeadStatus, ClientStatus, InvoiceStatus, CalendarEventStatus } from "@/types";

const LEAD_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  new:       { label: "Nuevo",      className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  contacted: { label: "Contactado", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  scheduled: { label: "Programado", className: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
  qualified: { label: "Calificado", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  lost:      { label: "Perdido",    className: "bg-red-100 text-red-700 hover:bg-red-100" },
  converted: { label: "Convertido", className: "bg-violet-100 text-violet-700 hover:bg-violet-100" },
};

const CLIENT_CONFIG: Record<ClientStatus, { label: string; className: string }> = {
  active:   { label: "Activo",    className: "bg-green-100 text-green-700 hover:bg-green-100" },
  inactive: { label: "Inactivo",  className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" },
  churned:  { label: "Perdido",   className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

const INVOICE_CONFIG: Record<InvoiceStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" },
  paid:    { label: "Pagada",    className: "bg-green-100 text-green-700 hover:bg-green-100" },
  overdue: { label: "Vencida",   className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

const EVENT_CONFIG: Record<CalendarEventStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  done:    { label: "Hecho",     className: "bg-green-100 text-green-700 hover:bg-green-100" },
};

interface Props {
  status: LeadStatus | ClientStatus | InvoiceStatus | CalendarEventStatus;
  type: "lead" | "client" | "invoice" | "event";
}

export function StatusBadge({ status, type }: Props) {
  let config: { label: string; className: string };
  if (type === "lead")         config = LEAD_CONFIG[status as LeadStatus];
  else if (type === "client")  config = CLIENT_CONFIG[status as ClientStatus];
  else if (type === "invoice") config = INVOICE_CONFIG[status as InvoiceStatus];
  else                         config = EVENT_CONFIG[status as CalendarEventStatus];

  return (
    <Badge className={`text-xs font-medium border-0 ${config.className}`}>
      {config.label}
    </Badge>
  );
}
