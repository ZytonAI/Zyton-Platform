-- ============================================================
-- Zyton Platform — el chat de WhatsApp se puede asignar solo
-- ============================================================
-- Hasta ahora el dueño de una conversación salía prestado del lead vinculado
-- (`leads.contacted_by`) o del cliente (`clients.closed_by`). Un mensaje de un
-- número que todavía no es lead no tiene de dónde heredarlo, así que el
-- desplegable de "quién lo trabaja" salía deshabilitado: justo el caso en el
-- que hace falta repartir el chat.
--
-- Con esta columna la conversación tiene su propia etiqueta y manda sobre la
-- del lead. NULL = sigue heredando del lead/cliente, como antes.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_to TEXT;

-- Al cambiar el equipo, actualizar también src/lib/team.ts y 018_team_tags.sql.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_assigned_to_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_assigned_to_check
  CHECK (assigned_to IS NULL OR assigned_to IN ('samuel', 'camilo', 'santiago', 'daniel'));

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON conversations(assigned_to);
