-- ============================================================
-- Zyton Platform — el identificador @lid de cada conversación
-- ============================================================
-- WhatsApp dejó de direccionar por número. A la misma persona la puede
-- identificar de dos formas:
--
--   573104163897@c.us     — el teléfono, que es lo que crea el CRM al abrir
--                           el chat desde un lead
--   52162478518357@lid    — el identificador interno, que es lo que WhatsApp
--                           manda cuando esa persona escribe
--
-- Mandar al `@c.us` en una cuenta ya migrada revienta con "No LID for user".
-- Esta columna guarda el `@lid` para poder responder —y sobre todo para poder
-- escribirle a alguien de cero, que era lo que no se podía—.
--
-- NULL = todavía no se ha resuelto; el envío cae al `wa_chat_id` de siempre.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS wa_lid TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_wa_lid ON conversations(wa_lid);

-- Las conversaciones que ya nacieron con un @lid como wa_chat_id (las creó un
-- mensaje entrante) ya tienen el dato: solo hay que copiarlo a su sitio.
UPDATE conversations
   SET wa_lid = wa_chat_id
 WHERE wa_lid IS NULL
   AND wa_chat_id LIKE '%@lid';
