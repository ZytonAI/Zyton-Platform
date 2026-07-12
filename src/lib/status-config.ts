// Fuente única de labels, colores e íconos por estado.
// Antes había dos sistemas en conflicto (StatusBadge vs. mapas inline en
// LeadsClient/MessageThread) que mostraban labels distintos para el mismo
// estado. Se adopta el lenguaje de ventas que ya veía el usuario en Leads.

import {
  UserX, UserCheck, CalendarClock, ThumbsUp, ThumbsDown, ShoppingCart,
  ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import type {
  LeadStatus, ClientStatus, InvoiceStatus, InvoiceType, CalendarEventStatus,
} from "@/types";

export interface StatusConfig {
  label: string;
  /** Clases para badges/pills (incluyen variante dark) */
  badgeClass: string;
  icon?: React.ElementType;
}

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new", "contacted", "scheduled", "qualified", "lost", "converted",
];

export const LEAD_STATUS: Record<LeadStatus, StatusConfig> = {
  new: {
    label: "Sin contactar",
    badgeClass: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
    icon: UserX,
  },
  contacted: {
    label: "Contactado",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    icon: UserCheck,
  },
  scheduled: {
    label: "Programado",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    icon: CalendarClock,
  },
  qualified: {
    label: "Interesado",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    icon: ThumbsUp,
  },
  lost: {
    label: "No interesado",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    icon: ThumbsDown,
  },
  converted: {
    label: "Compró",
    badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    icon: ShoppingCart,
  },
};

export const CLIENT_STATUS: Record<ClientStatus, StatusConfig> = {
  active: {
    label: "Activo",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  inactive: {
    label: "Inactivo",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  churned: {
    label: "Perdido",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
};

export const INVOICE_STATUS: Record<InvoiceStatus, StatusConfig> = {
  pending: {
    label: "Pendiente",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  paid: {
    label: "Pagada",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  overdue: {
    label: "Vencida",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
};

// payable = pago que hace la empresa (gasto); receivable = cobro a un cliente (ingreso)
export const INVOICE_TYPE: Record<InvoiceType, StatusConfig> = {
  payable: {
    label: "Pago",
    badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    icon: ArrowUpCircle,
  },
  receivable: {
    label: "Cobro",
    badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    icon: ArrowDownCircle,
  },
};

export const EVENT_STATUS: Record<CalendarEventStatus, StatusConfig> = {
  pending: {
    label: "Pendiente",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  done: {
    label: "Hecho",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
};
