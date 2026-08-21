-- ============================================================
-- Zyton Platform — Login por usuario (en vez de email)
-- ============================================================
-- Supabase Auth siempre necesita un email por debajo, pero el equipo entra
-- escribiendo su usuario (SamuelZY, CamiloZY, …). /api/auth/login traduce
-- usuario → email.
--
-- OPCIONAL: los cuatro del equipo se resuelven desde src/lib/team.ts, así que
-- el login funciona sin esta migración. Aplicarla sirve para poder dar de alta
-- gente nueva con usuario desde la base, sin tocar código.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Único sin distinguir mayúsculas: "samuelzy" y "SamuelZY" son el mismo
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username ON profiles (lower(username));

-- ── Usuarios del equipo ────────────────────────────────────
UPDATE profiles p SET username = v.username
FROM (VALUES
  ('zyton.automation@gmail.com', 'SamuelZY'),
  ('camilo@zytonai.com',         'CamiloZY'),
  ('santiago@zytonai.com',       'SantiagoZY'),
  ('daniel@zytonai.com',         'DanielZY')
) AS v(email, username)
JOIN auth.users u ON u.email = v.email
WHERE p.id = u.id;

-- Si alguien no tenía fila en profiles todavía, crearla
INSERT INTO profiles (id, full_name, username)
SELECT u.id, v.full_name, v.username
FROM (VALUES
  ('zyton.automation@gmail.com', 'Samuel',   'SamuelZY'),
  ('camilo@zytonai.com',         'Camilo',   'CamiloZY'),
  ('santiago@zytonai.com',       'Santiago', 'SantiagoZY'),
  ('daniel@zytonai.com',         'Daniel',   'DanielZY')
) AS v(email, full_name, username)
JOIN auth.users u ON u.email = v.email
ON CONFLICT (id) DO NOTHING;

-- ── El trigger de alta también copia el usuario ────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'username'
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        username  = COALESCE(EXCLUDED.username,  profiles.username);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
