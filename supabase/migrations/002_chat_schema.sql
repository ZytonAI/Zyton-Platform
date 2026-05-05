-- ============================================================
-- Zyton Platform — Chat / WhatsApp Schema (Stage 3)
-- ============================================================

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wa_chat_id      TEXT NOT NULL,          -- ID de WhatsApp (ej: 521234567890@c.us)
  contact_name    TEXT,
  contact_phone   TEXT NOT NULL,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, wa_chat_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations: owner full access" ON conversations
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_conversations_owner       ON conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversations_wa_chat_id  ON conversations(wa_chat_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg    ON conversations(owner_id, last_message_at DESC);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wa_message_id    TEXT,                  -- ID nativo de WhatsApp (para deduplicar)
  direction        TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body             TEXT NOT NULL,
  media_url        TEXT,
  media_type       TEXT,
  status           TEXT NOT NULL DEFAULT 'sent'
                     CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (wa_message_id)
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages: owner full access" ON messages
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_wa_id        ON messages(wa_message_id);

-- ============================================================
-- WHATSAPP SESSION (una por usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  status      TEXT NOT NULL DEFAULT 'disconnected'
                CHECK (status IN ('disconnected', 'connecting', 'connected')),
  phone       TEXT,                       -- Número conectado (cuando status=connected)
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_sessions: owner full access" ON wa_sessions
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ============================================================
-- Función RPC: increment_unread
-- ============================================================
CREATE OR REPLACE FUNCTION increment_unread(conversation_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE conversations
  SET unread_count = unread_count + 1
  WHERE id = conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Realtime — habilitar para mensajes en tiempo real
-- ============================================================
-- Ejecutar en Supabase Dashboard > Database > Replication:
-- Habilitar realtime para las tablas: messages, conversations, wa_sessions
