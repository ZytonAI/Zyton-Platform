-- ============================================================
-- Zyton Platform — leads: campo analyzed para Elisa
-- ============================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS analyzed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_analyzed ON leads(owner_id, analyzed) WHERE analyzed = false;
