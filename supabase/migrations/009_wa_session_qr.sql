-- Guarda el QR en Supabase para que la UI pueda mostrarlo
-- incluso cuando el bridge no es accesible directamente desde Vercel
ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS qr_code TEXT;
