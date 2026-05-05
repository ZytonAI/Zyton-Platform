-- ============================================================
-- Zyton Platform — AI Agents Schema (Stage 4)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  enabled       BOOLEAN NOT NULL DEFAULT false,
  name          TEXT NOT NULL DEFAULT 'Asistente ZytonAI',
  system_prompt TEXT NOT NULL DEFAULT 'Eres un asistente de ventas amable y profesional de ZytonAI. Responde de forma concisa y útil. Si el cliente tiene preguntas sobre precios o detalles específicos que no conoces, ofrece coordinar una llamada con el equipo.',
  model         TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_agents: owner full access" ON ai_agents
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
