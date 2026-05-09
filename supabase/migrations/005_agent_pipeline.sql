-- ============================================================
-- Zyton Platform — Agent Pipeline: leads extra fields
-- ============================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS website  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS maps_url TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(owner_id, source);
