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

ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS down_since TIMESTAMPTZ;
ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ;
ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS alert_muted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN wa_sessions.down_since IS
  'Cuándo se vio caída la sesión por primera vez en esta racha; NULL si está conectada';
COMMENT ON COLUMN wa_sessions.alerted_at IS
  'Cuándo se dio por atendida esta caída; NULL = todavía no se ha avisado';
COMMENT ON COLUMN wa_sessions.alert_muted IS
  'true si la caída se atendió en silencio (el Dueño cerró la sesión él mismo)';

-- El QR que quedó guardado de sesiones anteriores: fuera. Un QR de WhatsApp
-- rota cada ~20 s, así que el que hubiera aquí no sirve para nada más que
-- para filtrarse.
UPDATE wa_sessions SET qr_code = NULL WHERE qr_code IS NOT NULL;

COMMENT ON COLUMN wa_sessions.qr_code IS
  'OBSOLETA — el QR ya no se persiste (migración 027). Vincular el número es del Dueño.';
