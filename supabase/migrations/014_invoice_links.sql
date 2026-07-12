-- =============================================================
-- 014 — Vincular facturas a clientes
-- Permite ver facturas por cliente e ingresos por cliente.
-- client_id es opcional: las facturas de gastos generales siguen
-- siendo válidas sin cliente.
-- =============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(owner_id, client_id);
