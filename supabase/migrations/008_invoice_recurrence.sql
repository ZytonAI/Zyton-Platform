-- Agrega soporte de pagos recurrentes a facturas
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS is_recurring       BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_interval TEXT
    CHECK (recurrence_interval IN ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual'));
