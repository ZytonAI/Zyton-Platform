-- ============================================================
-- Zyton Platform — estado "Seguimiento pendiente"
-- ============================================================
-- Entre "Contactado" y "Programado" faltaba el caso más común de la
-- prospección en frío: ya se le escribió, contestó o quedó en algo, y hay
-- que volver a escribirle. Antes esos leads se quedaban en 'contacted' y no
-- se distinguían de los que nunca respondieron.
--
--   new → contacted → follow_up → scheduled → qualified → converted | lost
--
-- La migración no nombra la tabla: la busca por sus columnas. Un `ALTER TABLE
-- leads ...` suelto depende del search_path del editor, y hay otro proyecto de
-- Supabase con una `public.leads` que no tiene nada que ver (la de la
-- calculadora: full_name, calculator_used, simulation_data) — correrlo ahí
-- fallaba con un críptico "column status does not exist". Si en la base no está
-- la tabla del CRM, aquí se aborta diciendo qué base es y qué hay en ella.
-- ============================================================

-- ── 1. El CHECK de estados ─────────────────────────────────
-- La tabla no se nombra: se busca. Escribir `leads` a secas depende del
-- search_path del editor, y hay otro proyecto de Supabase con una tabla
-- `public.leads` completamente distinta (la de la calculadora: full_name,
-- calculator_used, simulation_data) — correrlo ahí fallaba con un críptico
-- "column status does not exist". Aquí se identifica la tabla del CRM por sus
-- columnas (status + owner_id), en el esquema que sea.
DO $$
DECLARE
  t     regclass;
  cols  text;
  raros text;
  otras text;
  r     record;
BEGIN
  SELECT c.oid::regclass INTO t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'status'
                    AND attnum > 0 AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'owner_id'
                    AND attnum > 0 AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'contacted_by'
                    AND attnum > 0 AND NOT attisdropped)
   ORDER BY (c.relname = 'leads') DESC, (n.nspname = 'public') DESC, c.oid
   LIMIT 1;

  -- No está: se dice qué tablas se parecen, para no adivinar de proyecto
  IF t IS NULL THEN
    SELECT string_agg(format('%s.%s (%s)', n.nspname, c.relname,
             (SELECT string_agg(a.attname, ', ' ORDER BY a.attnum)
                FROM pg_attribute a
               WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)),
             E'\n  ')
      INTO otras
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       AND c.relname ILIKE '%lead%';

    RAISE EXCEPTION
      E'No encontré la tabla de leads del CRM (status + owner_id + contacted_by) en la base "%".\nTablas parecidas:\n  %',
      current_database(), COALESCE(otras, '(ninguna)');
  END IF;

  SELECT string_agg(attname, ', ' ORDER BY attnum) INTO cols
    FROM pg_attribute WHERE attrelid = t AND attnum > 0 AND NOT attisdropped;

  -- El trigger del bloque 2 usa estas dos: si faltan, van antes la 022 y la 023
  IF NOT (cols LIKE '%contact_type%' AND cols LIKE '%contacted_at%') THEN
    RAISE EXCEPTION
      'Faltan contact_type/contacted_at en %: corre antes las migraciones 022 y 023. Columnas: %',
      t, cols;
  END IF;

  -- Estados fuera de la lista nueva: el ADD CONSTRAINT los rechazaría con un
  -- 23514 sin decir cuáles son.
  EXECUTE format(
    $q$SELECT string_agg(DISTINCT status, ', ') FROM %s
        WHERE status IS NOT NULL
          AND status NOT IN ('new','contacted','follow_up','scheduled','qualified','lost','converted')$q$,
    t
  ) INTO raros;

  IF raros IS NOT NULL THEN
    RAISE EXCEPTION 'Hay leads con estados que la nueva constraint no permite: %', raros;
  END IF;

  -- La constraint vieja se busca por su definición, no por nombre: según cuándo
  -- se creó el proyecto puede llamarse `leads_status_check` (migración 010) o
  -- llevar el nombre que le puso Postgres al CHECK inline de la 001.
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = t AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', t, r.conname);
    RAISE NOTICE 'constraint vieja eliminada: %', r.conname;
  END LOOP;

  EXECUTE format(
    $q$ALTER TABLE %s ADD CONSTRAINT leads_status_check
         CHECK (status IN ('new','contacted','follow_up','scheduled','qualified','lost','converted'))$q$,
    t
  );

  RAISE NOTICE 'CHECK actualizado en % (base "%")', t, current_database();
END $$;

-- ── 2. El nuevo estado también sella la fecha de contacto ──
-- Un lead en seguimiento ya fue contactado: cuenta igual que 'contacted'
-- para el KPI de la quincena (ver migraciones 022 y 023).
CREATE OR REPLACE FUNCTION public.stamp_lead_contacted_at()
RETURNS TRIGGER AS $fn$
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
        AND NEW.status IN ('contacted', 'follow_up', 'scheduled', 'qualified', 'converted'))
  ) THEN
    NEW.contacted_at := NOW();
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- ── 3. El trigger ──────────────────────────────────────────
-- Ya existe desde la 022; se recrea sobre la misma tabla que halló el bloque 1
-- por si el proyecto se quedó sin él.
DO $$
DECLARE
  t regclass;
BEGIN
  SELECT c.oid::regclass INTO t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'status'
                    AND attnum > 0 AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'owner_id'
                    AND attnum > 0 AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'contacted_by'
                    AND attnum > 0 AND NOT attisdropped)
   ORDER BY (c.relname = 'leads') DESC, (n.nspname = 'public') DESC, c.oid
   LIMIT 1;

  IF t IS NULL THEN
    RAISE EXCEPTION 'No encontré la tabla de leads para colgarle el trigger';
  END IF;

  EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_lead_contacted_at ON %s', t);
  EXECUTE format(
    'CREATE TRIGGER trg_stamp_lead_contacted_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION public.stamp_lead_contacted_at()', t);
  RAISE NOTICE 'trigger recreado sobre %', t;
END $$;
