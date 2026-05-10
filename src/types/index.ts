export type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "converted";
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
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
}

export interface HistoryEvent {
  id: string;
  event_type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface FileAttachment {
  id: string;
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
export type RecurrenceInterval = "weekly" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "semiannual" | "annual";
export type CalendarEventType = "event" | "task" | "deadline";
export type CalendarEventStatus = "pending" | "done";

export interface Invoice {
  id: string;
  owner_id: string;
  title: string;
  amount: number;
  category: string | null;
  due_date: string;
  status: InvoiceStatus;
  is_recurring: boolean;
  recurrence_interval: RecurrenceInterval | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  owner_id: string;
  title: string;
  event_date: string;
  type: CalendarEventType;
  description: string | null;
  status: CalendarEventStatus;
  created_at: string;
  updated_at: string;
}
