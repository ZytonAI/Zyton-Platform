-- =============================================================
-- 016 — Tipo de factura (pago/cobro) + cobro configurable por cliente
-- Antes todas las facturas eran gastos (pagos que hace la empresa).
-- Ahora se distingue "payable" (pago, gasto) de "receivable" (cobro,
-- ingreso de un cliente), y el perfil de cliente puede configurar un
-- cobro mensual o único que genera automáticamente su factura de cobro.
-- =============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'payable'
    CHECK (type IN ('payable', 'receivable'));

CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(owner_id, type);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_type TEXT
    CHECK (billing_type IN ('monthly', 'one_time')),
  ADD COLUMN IF NOT EXISTS billing_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS billing_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;
