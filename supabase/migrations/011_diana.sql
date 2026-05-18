-- Diana: historial de conversaciones
CREATE TABLE IF NOT EXISTS diana_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL DEFAULT 'web',
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE diana_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diana_messages: owner full access" ON diana_messages
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_diana_messages ON diana_messages(owner_id, channel, created_at);

-- Diana: tareas de agentes activadas por Diana
CREATE TABLE IF NOT EXISTS diana_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'running',
  params         JSONB,
  result_summary TEXT,
  notified       BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

ALTER TABLE diana_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diana_tasks: owner full access" ON diana_tasks
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_diana_tasks ON diana_tasks(owner_id, status);

-- Chat ID de Telegram por usuario (para notificaciones proactivas)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
-- Token de vinculación one-time para conectar Telegram con la cuenta
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_link_token TEXT;
