-- Soft delete para eventos del calendario (permiten recuperación)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Log de acciones de Diana para poder revertirlas
CREATE TABLE IF NOT EXISTS diana_action_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type  TEXT NOT NULL,   -- 'delete_event' | 'create_event' | 'update_lead_status'
  entity_type  TEXT NOT NULL,   -- 'calendar_event' | 'lead'
  entity_id    TEXT NOT NULL,
  description  TEXT NOT NULL,   -- Texto legible para mostrar al usuario
  old_data     JSONB,           -- Estado anterior (para revertir)
  new_data     JSONB,           -- Estado nuevo
  reversed_at  TIMESTAMPTZ,     -- Si fue revertida
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE diana_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diana_action_log: owner" ON diana_action_log
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_diana_action_log ON diana_action_log(owner_id, created_at DESC);
