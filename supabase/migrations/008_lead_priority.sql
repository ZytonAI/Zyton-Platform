-- Agrega campo de prioridad a leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS priority TEXT
  CHECK (priority IS NULL OR priority IN ('alta', 'media', 'baja'));
