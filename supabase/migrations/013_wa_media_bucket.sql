-- =============================================================
-- 013 — Bucket privado para media de WhatsApp
-- Nota: la numeración retoma en 013; los prefijos duplicados
-- 008/010 son históricos y ya están aplicados (no renombrar).
--
-- El webhook guarda la media entrante en este bucket con la ruta
--   {owner_id}/{conversation_id}/{wa_message_id}.{ext}
-- y en messages.media_url queda "wa-media/{ruta}" (convención
-- bucket/path). La escritura la hace solo el service role; los
-- usuarios solo pueden leer sus propios archivos.
-- =============================================================

insert into storage.buckets (id, name, public)
values ('wa-media', 'wa-media', false)
on conflict (id) do nothing;

-- Lectura: solo el dueño (primer segmento de la ruta = auth.uid())
create policy "wa-media owner read"
on storage.objects for select
using (
  bucket_id = 'wa-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Sin política de INSERT/UPDATE/DELETE para usuarios:
-- solo el service role (webhook) escribe en este bucket.
