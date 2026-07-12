-- =============================================================
-- 015 — Cadena de recurrencia de facturas
-- Cada factura recurrente genera como máximo UNA sucesora
-- (modelo de cadena). El índice único parcial hace que la
-- generación del cron sea idempotente: ejecutar el job dos veces
-- no puede crear dos sucesoras para el mismo padre.
-- =============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_recurrence_child
  ON invoices(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;
