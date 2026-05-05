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

export interface AgentConfig {
  id: string;
  owner_id: string;
  enabled: boolean;
  name: string;
  system_prompt: string;
  model: string;
  created_at: string;
  updated_at: string;
}
