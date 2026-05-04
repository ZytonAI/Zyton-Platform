import { Badge } from "@/components/ui/badge";
import type { LeadStatus, ClientStatus } from "@/types";

const LEAD_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  new:       { label: "Nuevo",      className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  contacted: { label: "Contactado", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  qualified: { label: "Calificado", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  lost:      { label: "Perdido",    className: "bg-red-100 text-red-700 hover:bg-red-100" },
  converted: { label: "Convertido", className: "bg-violet-100 text-violet-700 hover:bg-violet-100" },
};

const CLIENT_CONFIG: Record<ClientStatus, { label: string; className: string }> = {
  active:   { label: "Activo",    className: "bg-green-100 text-green-700 hover:bg-green-100" },
  inactive: { label: "Inactivo",  className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" },
  churned:  { label: "Perdido",   className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

interface Props {
  status: LeadStatus | ClientStatus;
  type: "lead" | "client";
}

export function StatusBadge({ status, type }: Props) {
  const config = type === "lead"
    ? LEAD_CONFIG[status as LeadStatus]
    : CLIENT_CONFIG[status as ClientStatus];

  return (
    <Badge className={`text-xs font-medium border-0 ${config.className}`}>
      {config.label}
    </Badge>
  );
}
