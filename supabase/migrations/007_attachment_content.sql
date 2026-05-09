-- Permite guardar contenido HTML/texto directamente en la BD
-- en vez de depender de Supabase Storage para informes pequeños
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS content TEXT;
