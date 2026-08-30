-- ============================================================
-- Zyton Platform — quitar la etiqueta descuenta del KPI
-- ============================================================
-- La migración 022 sellaba `contacted_at` la primera vez que el lead se
-- etiquetaba, y ahí se quedaba. Al quitar la etiqueta el lead desaparecía
-- de su meta (en frío / con investigación) pero seguía sumando en el total
-- de la quincena, porque el total se contaba por la fecha.
--
-- Ahora la fecha sigue a la etiqueta: ponerla la sella, quitarla la borra.
-- Así quitar la etiqueta descuenta de las dos cuentas, y volver a ponerla
-- más adelante cae en la quincena en la que se puso, no en la vieja.
--
-- Los otros caminos (asignarle dueño, moverlo a un estado de contactado)
-- siguen sellando la fecha cuando no hay ninguna: son los que hacen que el
-- lead aparezca como "sin etiquetar", que es el aviso de que no cuenta.
-- ============================================================

CREATE OR REPLACE FUNCTION stamp_lead_contacted_at()
RETURNS TRIGGER AS $$
BEGIN
  -- La etiqueta manda sobre la fecha
  IF NEW.contact_type IS DISTINCT FROM OLD.contact_type THEN
    IF NEW.contact_type IS NULL THEN
      NEW.contacted_at := NULL;
      RETURN NEW;
    END IF;
    -- Cambiar de 'frio' a 'investigado' no mueve la fecha original
    NEW.contacted_at := COALESCE(NEW.contacted_at, NOW());
    RETURN NEW;
  END IF;

  IF NEW.contacted_at IS NULL AND (
       (NEW.contacted_by IS NOT NULL AND OLD.contacted_by IS NULL)
    OR (NEW.status IS DISTINCT FROM OLD.status
        AND NEW.status IN ('contacted', 'scheduled', 'qualified', 'converted'))
  ) THEN
    NEW.contacted_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe desde la 022; esto solo reemplaza la función.

-- ── Limpiar lo que dejó la regla anterior ──────────────────
-- Un lead que sigue en 'new', sin dueño y sin etiqueta no pudo haber sellado
-- la fecha por ninguno de los otros caminos: la única explicación es una
-- etiqueta que se puso y se quitó cuando quitarla no borraba la fecha.
UPDATE leads
   SET contacted_at = NULL
 WHERE contacted_at IS NOT NULL
   AND contact_type IS NULL
   AND contacted_by IS NULL
   AND status = 'new';
