import type { TeamSlug } from "@/lib/team";

export type LeadStatus = "new" | "contacted" | "scheduled" | "qualified" | "lost" | "converted";

/**
 * Etiqueta de persona: el slug de un miembro del equipo (ver src/lib/team.ts)
 * o null cuando nadie la tiene asignada.
 */
export type MemberTag = TeamSlug | null;
export type ClientStatus = "active" | "inactive" | "churned";

export interface Lead {
  id: string;
  owner_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: LeadStatus;
  source: string | null;
  notes: string | null;
  website: string | null;
  maps_url: string | null;
  analyzed: boolean;
  priority: "alta" | "media" | "baja" | null;
  /** Quién lo contactó */
  contacted_by: MemberTag;
  /** Quién lo cerró */
  closed_by: MemberTag;
  /** Quién lo va a programar */
  scheduled_by: MemberTag;
  created_at: string;
  updated_at: string;
}

export type ClientBillingType = "monthly" | "one_time";

export interface Client {
  id: string;
  owner_id: string;
  lead_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: ClientStatus;
  contract_start: string | null;
  contract_end: string | null;
  notes: string | null;
  /** Cómo se le cobra a este cliente — null si no tiene cobro configurado */
  billing_type: ClientBillingType | null;
  billing_amount: number | null;
  /** Factura de cobro generada/sincronizada automáticamente a partir de billing_type/billing_amount */
  billing_invoice_id: string | null;
  /** Quién cerró al cliente */
  closed_by: MemberTag;
  /** Quién lo va a programar */
  scheduled_by: MemberTag;
  created_at: string;
  updated_at: string;
}

export interface HistoryEvent {
  id: string;
  event_type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  /** Quién lo hizo — se resuelve a persona con el directorio */
  owner_id: string | null;
  created_at: string;
}

export interface FileAttachment {
  id: string;
  /** Quién lo subió — se resuelve a persona con el directorio */
  owner_id?: string | null;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";
export type WaSessionStatus = "disconnected" | "connecting" | "connected";

export interface Conversation {
  id: string;
  owner_id: string;
  wa_chat_id: string;
  contact_name: string | null;
  contact_phone: string;
  lead_id: string | null;
  client_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  /**
   * Slug de quien trabaja este chat, derivado del lead vinculado
   * (contacted_by) o del cliente (closed_by). null = sin dueño, lo ve todo
   * el equipo. Lo calcula el servidor, no es una columna de la tabla.
   */
  assigned_to?: MemberTag;
}

export interface Message {
  id: string;
  owner_id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  body: string;
  media_url: string | null;
  media_type: string | null;
  status: MessageStatus;
  created_at: string;
  /** URL firmada (1 h) generada por la API al listar mensajes con media */
  media_signed_url?: string;
}

export interface WaSession {
  id: string;
  owner_id: string;
  status: WaSessionStatus;
  phone: string | null;
  updated_at: string;
}

// ── Agent Pipeline ──────────────────────────────────────────
export interface ApifyLead {
  name: string;
  phone: string | null;
  website: string | null;
  company: string | null;
  maps_url: string | null;
  category: string | null;
}

export type AgentEventType = "status" | "progress" | "result" | "error" | "done";

export interface AgentEvent {
  type: AgentEventType;
  message?: string;
  // Raúl
  leads?: Lead[];
  saved?: number;
  // Elisa
  analysis?: WebAnalysis;
  html?: string;
  lead_id?: string;
  report_url?: string;
  current?: number;
  total?: number;
}

export interface WebAnalysis {
  nombre: string;
  descripcion: string;
  telefono: string | null;
  email: string | null;
  servicios: string[];
  resumen: string;
  puntaje_web: number;
  velocidad: string;
  metricas: { label: string; actual: number; benchmark: number }[];
  oportunidades: string[];
}

export type InvoiceStatus = "pending" | "paid" | "overdue";
/** payable = pago que hace la empresa (gasto); receivable = cobro a un cliente (ingreso) */
export type InvoiceType = "payable" | "receivable";
export type RecurrenceInterval = "weekly" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "semiannual" | "annual";
export type CalendarEventType = "event" | "task" | "deadline";
export type CalendarEventStatus = "pending" | "done";
/** team = lo ve todo el equipo; personal = solo quien lo creó */
export type CalendarEventVisibility = "team" | "personal";

export interface Invoice {
  id: string;
  owner_id: string;
  title: string;
  amount: number;
  category: string | null;
  due_date: string;
  status: InvoiceStatus;
  type: InvoiceType;
  is_recurring: boolean;
  recurrence_interval: RecurrenceInterval | null;
  /** Cliente al que pertenece la factura (opcional — gastos generales sin cliente) */
  client_id: string | null;
  /** Factura recurrente que generó esta (cadena de recurrencia) */
  recurrence_parent_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Join opcional (.select("*, clients(name)")) */
  clients?: { name: string } | null;
}

export interface CalendarEvent {
  id: string;
  owner_id: string;
  title: string;
  event_date: string;
  type: CalendarEventType;
  description: string | null;
  status: CalendarEventStatus;
  visibility: CalendarEventVisibility;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WikiPage {
  id: string;
  owner_id: string;
  title: string;
  content: Record<string, unknown>;
  parent_id: string | null;
  icon: string;
  position: number;
  /** team = la ve el equipo; personal = solo quien la creó */
  visibility: CalendarEventVisibility;
  /** Quién guardó por última vez */
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── To Do del equipo ────────────────────────────────────────
export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  owner_id: string;
  assignee: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}
