-- ============================================================
-- Zyton Platform — KPI de contactos por quincena
-- ============================================================
-- La meta comercial es de 30 contactos por persona cada quincena:
--
--   25 en frío           — se escribe sin haber mirado el negocio antes
--    5 con investigación — se revisó el negocio antes de escribir
--
-- Para poder medirlo hacen falta dos datos que hasta ahora no existían:
--
--   leads.contact_type — cómo fue el contacto ('frio' | 'investigado').
--                        NULL = todavía no lo etiquetaron.
--   leads.contacted_at — cuándo se contactó, que es lo que decide en qué
--                        quincena cae. NULL = nunca se contactó.
--
-- La quincena va del 1 al 15 y del 16 a fin de mes, hora de Colombia
-- (ver src/lib/kpi.ts, que es de donde salen las tarjetas del Dashboard).
-- ============================================================

-- ── Cómo fue el contacto ───────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_type TEXT;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_contact_type_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_contact_type_check
  CHECK (contact_type IS NULL OR contact_type IN ('frio', 'investigado'));

-- ── Cuándo se contactó ─────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_contacted_at ON leads(contacted_at);
CREATE INDEX IF NOT EXISTS idx_leads_contact_type ON leads(contact_type);

-- ── La fecha se pone sola ──────────────────────────────────
-- Contactar un lead pasa por muchas puertas: la ficha, el menú de la lista,
-- abrir su chat de WhatsApp, un cambio de estado en lote de Diana. En vez de
-- acordarse de sellar la fecha en cada una, lo hace la base.
--
-- Solo en UPDATE, a propósito: Raúl inserta sus leads ya con `contacted_by`
-- (quién los VA a contactar), y eso no es haberlos contactado.
CREATE OR REPLACE FUNCTION stamp_lead_contacted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contacted_at IS NULL AND (
       (NEW.contact_type IS NOT NULL AND OLD.contact_type IS NULL)
    OR (NEW.contacted_by IS NOT NULL AND OLD.contacted_by IS NULL)
    OR (NEW.status IS DISTINCT FROM OLD.status
        AND NEW.status IN ('contacted', 'scheduled', 'qualified', 'converted'))
  ) THEN
    NEW.contacted_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stamp_lead_contacted_at ON leads;
CREATE TRIGGER trg_stamp_lead_contacted_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION stamp_lead_contacted_at();

-- Nota: los leads que ya estaban contactados antes de esta migración quedan
-- con contacted_at NULL y no cuentan para ninguna quincena. Es a propósito:
-- no hay forma honesta de saber cuándo se contactaron.
