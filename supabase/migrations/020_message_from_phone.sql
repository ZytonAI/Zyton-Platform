-- ============================================================
-- Zyton Platform — Distinguir lo escrito desde el celular
-- ============================================================
-- El bridge ahora reenvía también los mensajes que el equipo escribe desde el
-- WhatsApp del celular (evento message_create), no solo los que entran.
--
-- El problema: en esos no se sabe quién los escribió. El número lo comparten
-- los cuatro y WhatsApp no dice qué persona tecleó. Sin esta marca, el CRM se
-- los atribuiría a quien conectó la sesión, que es peor que no decir nada.
--
--   false (default) — se mandó desde la plataforma; owner_id es quien lo hizo
--   true            — se escribió desde el celular; el autor es desconocido
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS from_phone BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN messages.from_phone IS
  'true = escrito desde el WhatsApp del celular; owner_id es solo el dueño de la sesión, no el autor.';
