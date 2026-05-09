-- ============================================================
-- Zyton Platform — Facturas & Calendario
-- ============================================================

-- ============================================================
-- FACTURAS (Gastos / Expenses)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL,
  category   TEXT,
  due_date   DATE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'paid', 'overdue')),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices: owner full access" ON invoices
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_invoices_owner    ON invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(owner_id, due_date ASC);

-- ============================================================
-- CALENDARIO (Events / Tasks / Deadlines)
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  event_date  TIMESTAMPTZ NOT NULL,
  type        TEXT NOT NULL DEFAULT 'event'
                CHECK (type IN ('event', 'task', 'deadline')),
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'done')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_events: owner full access" ON calendar_events
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_events_owner ON calendar_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_events_date  ON calendar_events(owner_id, event_date ASC);
