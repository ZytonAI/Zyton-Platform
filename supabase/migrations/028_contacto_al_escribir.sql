-- ============================================================
-- Zyton Platform — el contacto se sella al escribir, y borrar el chat
--                  no borra la prueba de que se contactó
-- ============================================================
-- Tres cosas que se rompían juntas y se veían como tres problemas distintos:
--
-- 1. Un lead al que se le escribió seguía saliendo como "Nuevo", así que
--    alguien le volvía a escribir. La cadena de causas:
--
--      · Raúl inserta sus leads YA con `contacted_by` puesto (quién los va a
--        contactar). Eso es 307 de los 322 leads que hay.
--      · `tagLeadContactedBy` (abrir el chat) solo escribía el dueño cuando
--        `contacted_by` estaba vacío → con los de Raúl no hacía nada.
--      · El trigger de la 022 sella `contacted_at` cuando `contacted_by` pasa
--        de vacío a lleno, y eso pasó en el INSERT — pero el trigger es
--        BEFORE UPDATE, así que nunca corrió.
--      · Y enviar un mensaje no tocaba el lead en absoluto.
--
--    Resultado: 122 leads con dueño y sin fecha de contacto, 112 de ellos
--    todavía en 'new'.
--
-- 2. El KPI de la quincena mostraba contactos "sin etiquetar" que sí estaban
--    etiquetados: un lead creado a mano CON la etiqueta puesta nace sin
--    `contacted_at` (el trigger no corre en INSERT) y no cuenta en ninguna
--    quincena. Al revés también: 41 leads tenían fecha y ninguna etiqueta.
--
-- 3. Borrar el chat parecía devolver el lead a "no contactado". La ruta de
--    borrado nunca tocó el lead — el problema es que, como nada escribía el
--    contacto EN el lead, el chat era el único registro que existía. De los
--    122 sin fecha, 117 ya no tienen chat.
--
-- Lo que hace esta migración:
--   1. El trigger también corre en INSERT, para que un lead que nace
--      etiquetado o ya contactado cuente desde el primer día.
--   2. `conversaciones_borradas` guarda la foto del chat al borrarlo, para
--      los chats que ni siquiera tienen lead al que dejarle la historia.
--   3. Reconstruye lo que se puede del histórico, con el primer mensaje
--      ENVIADO como fecha de contacto — que es el único dato honesto que hay.
--
-- La regla nueva, decidida con el dueño: **se contacta al enviar el primer
-- mensaje**, y un contacto sin etiqueta cuenta como 'frio' (la meta son 50 en
-- frío y 5 con investigación: en frío es el caso normal). El código que lo
-- aplica está en `src/lib/lead-contacto.ts`.
-- ============================================================

-- ── 0. Que sea la base del CRM y no otra ───────────────────
-- Hay otro proyecto de Supabase con una `public.leads` que no tiene nada que
-- ver (la de la calculadora: full_name, calculator_used, simulation_data).
-- Correr esto ahí fallaba con errores crípticos a mitad de camino; aquí se
-- aborta al principio diciendo en qué base se está.
DO $$
DECLARE
  faltan text;
BEGIN
  IF to_regclass('public.leads') IS NULL THEN
    RAISE EXCEPTION 'No hay public.leads en la base "%": esta migración es del CRM interno', current_database();
  END IF;

  SELECT string_agg(c, ', ') INTO faltan
    FROM unnest(ARRAY['status','owner_id','contacted_by','contact_type','contacted_at','phone']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.leads'::regclass AND attname = c
        AND attnum > 0 AND NOT attisdropped);

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION
      'A public.leads de la base "%" le faltan columnas (%): o no es el CRM, o van antes las migraciones 018, 022 y 023',
      current_database(), faltan;
  END IF;

  IF to_regclass('public.conversations') IS NULL OR to_regclass('public.messages') IS NULL THEN
    RAISE EXCEPTION 'Faltan conversations/messages en la base "%": corre antes la migración 002', current_database();
  END IF;
END $$;

-- ── 1. Un solo criterio para "contactado" ──────────────────
-- Tres arreglos sobre la función de la 025, los tres por la misma razón: que
-- la fecha, la etiqueta y el estado no puedan volver a contradecirse.
--
-- (a) **También corre en INSERT.** Un lead puede nacer contactado: se crea a
--     mano con la etiqueta puesta, o directamente en un estado de contactado.
--     Esos no sellaban la fecha y quedaban fuera de todas las quincenas
--     —etiquetados y sin contar—, que es lo que se veía en el panel.
--
-- (b) **Asignarle dueño ya no cuenta como contactarlo.** La 022 sellaba la
--     fecha cuando `contacted_by` pasaba de vacío a lleno. Eso era verdad
--     cuando asignar y contactar iban juntos, pero hoy Raúl asigna 300 leads
--     de una y abrir un chat también asigna: el lead quedaba con fecha de
--     contacto sin que nadie le hubiera escrito, y sin etiqueta — que es de
--     donde salían la mitad de los "sin etiquetar · no cuentan". Además era
--     incoherente: en INSERT el mismo dato nunca contó como contacto.
--     Quien contacta ahora es quien envía (`src/lib/lead-contacto.ts`).
--
-- (c) **Si hay fecha, hay etiqueta.** Siempre que se sella la fecha y no hay
--     etiqueta se pone 'frio', que es el caso normal (la meta son 50 en frío
--     y 5 con investigación). Así ningún camino —el chat, la ficha, un cambio
--     de estado en lote de Diana— puede volver a crear un contacto que no
--     cuenta. Quitar la etiqueta sigue borrando la fecha, como en la 023: la
--     etiqueta manda, y quitarla es la forma de decir "esto no fue un
--     contacto".
CREATE OR REPLACE FUNCTION public.stamp_lead_contacted_at()
RETURNS TRIGGER AS $fn$
BEGIN
  -- ── Al nacer ──
  IF TG_OP = 'INSERT' THEN
    IF NEW.contacted_at IS NULL AND (
         NEW.contact_type IS NOT NULL
      OR NEW.status IN ('contacted', 'follow_up', 'scheduled', 'qualified', 'converted')
    ) THEN
      NEW.contacted_at := NOW();
    END IF;

    IF NEW.contacted_at IS NOT NULL AND NEW.contact_type IS NULL THEN
      NEW.contact_type := 'frio';
    END IF;

    RETURN NEW;
  END IF;

  -- ── Al cambiar ──
  -- La etiqueta manda sobre la fecha (migración 023)
  IF NEW.contact_type IS DISTINCT FROM OLD.contact_type THEN
    IF NEW.contact_type IS NULL THEN
      NEW.contacted_at := NULL;
      RETURN NEW;
    END IF;
    -- Cambiar de 'frio' a 'investigado' no mueve la fecha original
    NEW.contacted_at := COALESCE(NEW.contacted_at, NOW());
    RETURN NEW;
  END IF;

  -- Moverlo a un estado de contactado sí lo sella. Asignarle dueño ya no.
  IF NEW.contacted_at IS NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('contacted', 'follow_up', 'scheduled', 'qualified', 'converted')
  THEN
    NEW.contacted_at := NOW();
  END IF;

  -- Si quedó fecha, que no quede sin etiqueta
  IF NEW.contacted_at IS NOT NULL AND NEW.contact_type IS NULL THEN
    NEW.contact_type := 'frio';
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- El de UPDATE ya existe desde la 022 y apunta a esta misma función; este es
-- el que faltaba.
DROP TRIGGER IF EXISTS trg_stamp_lead_contacted_at_insert ON public.leads;
CREATE TRIGGER trg_stamp_lead_contacted_at_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.stamp_lead_contacted_at();

-- ── 2. La foto del chat que se borra ───────────────────────
-- Borrar un chat es limpiar la bandeja, no deshacer el trabajo. Con la regla
-- nueva el lead ya se queda con su estado, su dueño y su etiqueta, así que el
-- KPI no se mueve; esto es para lo que el lead NO puede guardar: cuántos
-- mensajes hubo, cuándo fue el último, a quién estaba asignado el chat y
-- quién lo borró. Y sirve para los chats de números que todavía no son lead,
-- que no tienen ficha donde dejar la historia.
CREATE TABLE IF NOT EXISTS public.conversaciones_borradas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sin FK: el lead puede borrarse después y esta fila tiene que sobrevivir
  lead_id          UUID,
  contact_phone    TEXT,
  contact_name     TEXT,
  -- A quién estaba asignado el chat (conversations.assigned_to)
  assigned_to      TEXT,
  mensajes_total   INTEGER NOT NULL DEFAULT 0,
  mensajes_enviados INTEGER NOT NULL DEFAULT 0,
  mensajes_recibidos INTEGER NOT NULL DEFAULT 0,
  primer_mensaje   TIMESTAMPTZ,
  ultimo_mensaje   TIMESTAMPTZ,
  -- La foto del lead en el momento de borrar: si estaba interesado (su
  -- estado), si se había contactado (la fecha), quién lo contactó y si fue
  -- en frío o con investigación. Lo que el dueño pidió que no se perdiera.
  lead_status      TEXT,
  contacted_by     TEXT,
  contact_type     TEXT,
  contacted_at     TIMESTAMPTZ,
  -- Quién borró y cuándo
  borrado_por      UUID REFERENCES auth.users(id),
  borrado_por_slug TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_borradas_lead  ON public.conversaciones_borradas(lead_id);
CREATE INDEX IF NOT EXISTS idx_conv_borradas_fecha ON public.conversaciones_borradas(created_at DESC);

-- El historial del equipo lo ve el equipo, como el resto de las tablas del
-- workspace (migración 013). Nadie lo edita ni lo borra desde la app: se
-- escribe una vez y se queda.
ALTER TABLE public.conversaciones_borradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversaciones_borradas: team read"   ON public.conversaciones_borradas;
DROP POLICY IF EXISTS "conversaciones_borradas: team insert" ON public.conversaciones_borradas;

CREATE POLICY "conversaciones_borradas: team read"
  ON public.conversaciones_borradas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "conversaciones_borradas: team insert"
  ON public.conversaciones_borradas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

COMMENT ON TABLE public.conversaciones_borradas IS
  'Foto de cada chat de WhatsApp al borrarlo: conteo de mensajes y estado del lead en ese momento. Se escribe una vez y no se toca.';

-- ── 3. Reconstruir el histórico ────────────────────────────
-- Lo único honesto que hay para fechar un contacto viejo es el primer mensaje
-- que SALIÓ de la plataforma. Los chats ya borrados no dejaron mensajes, así
-- que esos leads no se pueden recuperar y se quedan como están.
DO $$
DECLARE
  n_envios integer;
  n_nacidos integer;
  n_etiqueta integer;
BEGIN
  -- 3.a — Leads con mensaje enviado que figuraban sin contactar.
  -- La conversación se casa con el lead por `lead_id` o, si no lo tiene, por
  -- los últimos 10 dígitos del teléfono (que es como los casa la app).
  WITH envios AS (
    SELECT c.id            AS conv_id,
           c.lead_id       AS lead_id,
           c.contact_phone AS contact_phone,
           MIN(m.created_at) AS primer_envio
      FROM public.conversations c
      JOIN public.messages m
        ON m.conversation_id = c.id
       AND m.direction = 'outbound'
     GROUP BY c.id, c.lead_id, c.contact_phone
  ),
  por_lead AS (
    SELECT l.id AS lead_id, MIN(e.primer_envio) AS primer_envio
      FROM public.leads l
      JOIN envios e
        ON e.lead_id = l.id
        OR (
             length(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g')) >= 10
         AND right(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g'), 10)
           = right(regexp_replace(COALESCE(e.contact_phone, ''), '\D', '', 'g'), 10)
           )
     GROUP BY l.id
  )
  UPDATE public.leads l
     SET contacted_at = p.primer_envio,
         status = CASE WHEN l.status = 'new' THEN 'contacted' ELSE l.status END
    FROM por_lead p
   WHERE l.id = p.lead_id
     AND l.contacted_at IS NULL;
  GET DIAGNOSTICS n_envios = ROW_COUNT;

  -- 3.b — Leads que nacieron etiquetados y nunca sellaron la fecha. Sin
  -- mensajes con los que fecharlos, la fecha de creación es lo más cercano.
  UPDATE public.leads
     SET contacted_at = created_at
   WHERE contact_type IS NOT NULL
     AND contacted_at IS NULL;
  GET DIAGNOSTICS n_nacidos = ROW_COUNT;

  -- 3.c — Todo lo que ya cuenta como contactado y no tiene etiqueta pasa a
  -- 'frio', que es la regla nueva. Sin esto el panel sigue enseñando
  -- "sin etiquetar · no cuentan" por trabajo que sí se hizo.
  UPDATE public.leads
     SET contact_type = 'frio'
   WHERE contacted_at IS NOT NULL
     AND contact_type IS NULL;
  GET DIAGNOSTICS n_etiqueta = ROW_COUNT;

  RAISE NOTICE 'Reconstruido: % leads fechados por su primer mensaje enviado, % por su fecha de creación, % etiquetados como frío.',
    n_envios, n_nacidos, n_etiqueta;
END $$;

-- ── Comprobación ───────────────────────────────────────────
-- Después de esto no debería quedar ningún lead etiquetado sin fecha ni
-- ningún lead con fecha sin etiqueta. Lo que sí puede quedar: leads con
-- `contacted_by` y sin fecha — son los de Raúl a los que de verdad nadie ha
-- escrito todavía, y esos tienen que seguir saliendo como no contactados.
DO $$
DECLARE
  sin_fecha integer;
  sin_etiqueta integer;
  pendientes integer;
BEGIN
  SELECT count(*) INTO sin_fecha    FROM public.leads WHERE contact_type IS NOT NULL AND contacted_at IS NULL;
  SELECT count(*) INTO sin_etiqueta FROM public.leads WHERE contacted_at IS NOT NULL AND contact_type IS NULL;
  SELECT count(*) INTO pendientes   FROM public.leads WHERE contacted_by IS NOT NULL AND contacted_at IS NULL;

  IF sin_fecha > 0 OR sin_etiqueta > 0 THEN
    RAISE EXCEPTION 'La reconstrucción no cuadró: % etiquetados sin fecha, % con fecha sin etiqueta', sin_fecha, sin_etiqueta;
  END IF;

  RAISE NOTICE 'OK. Quedan % leads asignados a alguien y sin contactar todavía (los de Raúl por escribir).', pendientes;
END $$;
