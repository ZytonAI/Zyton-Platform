import { Badge } from "@/components/ui/badge";
import {
  LEAD_STATUS, CLIENT_STATUS, INVOICE_STATUS, EVENT_STATUS,
} from "@/lib/status-config";
import type { LeadStatus, ClientStatus, InvoiceStatus, CalendarEventStatus } from "@/types";

interface Props {
  status: LeadStatus | ClientStatus | InvoiceStatus | CalendarEventStatus;
  type: "lead" | "client" | "invoice" | "event";
}

export function StatusBadge({ status, type }: Props) {
  const config =
    type === "lead"    ? LEAD_STATUS[status as LeadStatus] :
    type === "client"  ? CLIENT_STATUS[status as ClientStatus] :
    type === "invoice" ? INVOICE_STATUS[status as InvoiceStatus] :
                         EVENT_STATUS[status as CalendarEventStatus];

  return (
    <Badge className={`text-xs font-medium border-0 ${config.badgeClass}`}>
      {config.label}
    </Badge>
  );
}
