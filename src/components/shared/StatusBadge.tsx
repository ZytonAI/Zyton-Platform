import { Badge } from "@/components/ui/badge";
import {
  LEAD_STATUS, CLIENT_STATUS, INVOICE_STATUS, INVOICE_TYPE, EVENT_STATUS,
} from "@/lib/status-config";
import type { LeadStatus, ClientStatus, InvoiceStatus, InvoiceType, CalendarEventStatus } from "@/types";

interface Props {
  status: LeadStatus | ClientStatus | InvoiceStatus | InvoiceType | CalendarEventStatus;
  type: "lead" | "client" | "invoice" | "invoiceType" | "event";
}

export function StatusBadge({ status, type }: Props) {
  const config =
    type === "lead"        ? LEAD_STATUS[status as LeadStatus] :
    type === "client"      ? CLIENT_STATUS[status as ClientStatus] :
    type === "invoice"     ? INVOICE_STATUS[status as InvoiceStatus] :
    type === "invoiceType" ? INVOICE_TYPE[status as InvoiceType] :
                             EVENT_STATUS[status as CalendarEventStatus];

  return (
    <Badge className={`text-xs font-medium border-0 ${config.badgeClass}`}>
      {config.label}
    </Badge>
  );
}
