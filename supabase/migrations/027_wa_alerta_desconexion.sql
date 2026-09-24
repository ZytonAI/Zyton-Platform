-- ============================================================
-- Zyton Platform — aviso de WhatsApp caído y QR solo para el Dueño
-- ============================================================
-- Dos cosas que iban juntas:
--
-- 1. Cuando el número del equipo se desconecta, nadie se entera hasta que
--    alguien abre el chat y se encuentra el QR. Ahora un chequeo periódico
--    (src/lib/wa-alert.ts) lo detecta y Diana le escribe al Dueño por
--    Telegram. Estas dos columnas son las que evitan que ese aviso se mande
--    veinte veces por la misma caída.
--
--      down_since  cuándo se vio caída por primera vez en esta racha.
--                  Se exige que aguante unos minutos antes de avisar, para
--                  no sonar por cada parpadeo de red o redespliegue.
--      alerted_at  cuándo se dio por atendida ESTA racha. Que esté lleno es
--                  la señal de "ya no vuelvas a sonar por esto". Se limpia
--                  sola cuando WhatsApp vuelve.
--      alert_muted true cuando la racha se dio por atendida SIN mandar nada:
--                  es el caso del Dueño cerrando la sesión con el botón. Sin
--                  esta tercera columna no se distingue de una caída real, y
--                  al reconectar le llegaba un "ya volvió" de algo que él
--                  mismo acababa de hacer a propósito.
--
--    Ambas se reclaman con un UPDATE condicional (... WHERE alerted_at IS
--    NULL), que en Postgres es atómico: si cuatro personas tienen el chat
--    abierto y el chequeo corre a la vez, solo uno se lleva el aviso.
--
-- 2. El QR deja de guardarse aquí. `wa_sessions` es una tabla compartida por
--    el equipo (migración 013: "team full access"), así que un Socio con la
--    anon key podía leerse el `qr_code` y vincular su propio celular al
--    número de la empresa. Esconderlo en la interfaz no arreglaba eso.
--
--    Ahora el QR solo viaja del bridge al navegador del Dueño, en la
--    respuesta de /api/whatsapp/status, y no se persiste en ningún lado.
--    La columna se queda (para no romper despliegues viejos a mitad de
--    camino) pero se vacía y ya nadie la escribe.
-- ============================================================

-- ── 0. Que sea la base del CRM, y encontrar la tabla ───────
-- Hay dos proyectos de Supabase: el del CRM interno y el del SaaS. En el del
-- SaaS no existe `wa_sessions`, así que pegar esto allí aborta en el primer
-- ALTER con "relation wa_sessions does not exist" y no se aplica nada — que
-- es justo lo que pasó la primera vez. Aquí se dice en qué base se está
-- antes de tocar nada, y la tabla se busca por sus columnas en vez de
-- escribirla a secas: `wa_sessions` sin esquema depende del search_path del
-- editor. Mismo criterio que la migración 025.
--
-- Todo lo de abajo es repetible: correrla dos veces no rompe nada.
DO $mig$
DECLARE
  t     regclass;
  otras text;
BEGIN
  SELECT c.oid::regclass INTO t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'owner_id'
                    AND attnum > 0 AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'status'
                    AND attnum > 0 AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = c.oid AND attname = 'qr_code'
                    AND attnum > 0 AND NOT attisdropped)
   ORDER BY (c.relname = 'wa_sessions') DESC, (n.nspname = 'public') DESC, c.oid
   LIMIT 1;

  IF t IS NULL THEN
    SELECT string_agg(format('%s.%s', n.nspname, c.relname), ', ')
      INTO otras
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       AND (c.relname ILIKE '%wa%' OR c.relname ILIKE '%whatsapp%' OR c.relname ILIKE '%session%');

    RAISE EXCEPTION
      E'No encontré la tabla de sesiones de WhatsApp (owner_id + status + qr_code) en la base "%".\nEsta migración es del CRM interno (Plataforma-Zyton), no del SaaS: comprueba en qué proyecto de Supabase estás.\nTablas parecidas aquí: %',
      current_database(), COALESCE(otras, '(ninguna)');
  END IF;

  RAISE NOTICE 'Aplicando la 027 sobre % (base "%")', t, current_database();

  -- ── Las tres columnas del aviso ──
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS down_since TIMESTAMPTZ', t);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ', t);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS alert_muted BOOLEAN NOT NULL DEFAULT false', t);

  EXECUTE format($c$COMMENT ON COLUMN %s.down_since IS
    'Cuándo se vio caída la sesión por primera vez en esta racha; NULL si está conectada'$c$, t);
  EXECUTE format($c$COMMENT ON COLUMN %s.alerted_at IS
    'Cuándo se dio por atendida esta caída; NULL = todavía no se ha avisado'$c$, t);
  EXECUTE format($c$COMMENT ON COLUMN %s.alert_muted IS
    'true si la caída se atendió en silencio (el Dueño cerró la sesión él mismo)'$c$, t);

  -- ── El QR que quedó guardado de sesiones anteriores: fuera ──
  -- Un QR de WhatsApp rota cada ~20 s, así que el que hubiera aquí no sirve
  -- para nada más que para filtrarse.
  EXECUTE format('UPDATE %s SET qr_code = NULL WHERE qr_code IS NOT NULL', t);

  EXECUTE format($c$COMMENT ON COLUMN %s.qr_code IS
    'OBSOLETA — el QR ya no se persiste (migración 027). Vincular el número es del Dueño.'$c$, t);
END $mig$;

-- ── Comprobación ───────────────────────────────────────────
-- Que no se pueda dar por aplicada sin estarlo, que es como quedó la primera
-- vez: el deploy salió y el aviso de caída nunca habría sonado.
DO $chk$
DECLARE
  faltan text;
BEGIN
  IF to_regclass('public.wa_sessions') IS NULL THEN
    RAISE EXCEPTION 'No hay public.wa_sessions en la base "%" — ¿es el proyecto del CRM interno?', current_database();
  END IF;

  SELECT string_agg(c, ', ') INTO faltan
    FROM unnest(ARRAY['down_since','alerted_at','alert_muted']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.wa_sessions'::regclass AND attname = c
        AND attnum > 0 AND NOT attisdropped);

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'public.wa_sessions sigue sin las columnas: %', faltan;
  END IF;

  RAISE NOTICE 'OK: public.wa_sessions ya tiene down_since, alerted_at y alert_muted.';
END $chk$;
