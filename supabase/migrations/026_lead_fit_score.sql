-- ============================================================
-- Zyton Platform — puntaje del filtro de Raúl
-- ============================================================
-- Raúl ya no guarda todo lo que encuentra en Google Maps: cada negocio pasa
-- antes por un filtro de IA que decide si de verdad le podemos vender algo.
-- Aquí se guarda el resultado de ese juicio, para que en la ficha del lead se
-- vea por qué entró y no haya que confiar a ciegas.
--
--   fit_score  0–100, qué tanto encaja con el cliente ideal de ZytonAI
--   fit_reason la frase del filtro ("clínica de barrio con web en Wix vieja")
--
-- La prioridad (alta/media/baja, migración 008) se deriva del puntaje, así que
-- no se agrega nada nuevo para eso.
--
-- Si esta migración todavía no corrió, `src/lib/pg-compat.ts` guarda el lead
-- sin estas dos columnas: se pierde el puntaje, no el lead.
-- ============================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_score INTEGER
  CHECK (fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_reason TEXT;

COMMENT ON COLUMN leads.fit_score IS
  'Puntaje 0-100 del filtro de IA de Raúl: qué tanto encaja como cliente de ZytonAI';
COMMENT ON COLUMN leads.fit_reason IS
  'Explicación corta del filtro de IA de Raúl sobre por qué el lead entró';

-- Para ordenar la lista por los mejores primero sin escanear toda la tabla
CREATE INDEX IF NOT EXISTS idx_leads_fit_score ON leads(fit_score DESC NULLS LAST);
