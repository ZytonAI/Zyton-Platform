ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_lead ON calendar_events(lead_id);
