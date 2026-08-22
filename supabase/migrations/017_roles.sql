-- ============================================================
-- Zyton Platform — Roles: Dueño y Socios Estratégicos
-- ============================================================
-- El workspace sigue siendo compartido (migración 013): los cuatro ven y
-- editan leads, clientes, calendario, wiki, chat y tareas.
--
-- Lo que cambia es el dinero que entra:
--
--   owner   — Dueño (Samuel). Acceso total, incluida la sección Facturas.
--   partner — Socio Estratégico (Camilo, Santiago, Daniel). Todo menos
--             los cobros: no ven ni tocan la tabla `invoices`.
--
-- La app aplica lo mismo desde src/lib/permissions.ts; esto es el candado
-- de la base, para que no baste con llamar a Supabase con la anon key.
-- ============================================================

-- ── Columna de rol ─────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'partner';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'partner'));

-- ── Rol de cada persona del equipo (espejo de src/lib/team.ts) ──
UPDATE profiles p SET role = v.role
FROM (VALUES
  ('zyton.automation@gmail.com', 'owner'),
  ('camilo@zytonai.com',         'partner'),
  ('santiago@zytonai.com',       'partner'),
  ('daniel@zytonai.com',         'partner')
) AS v(email, role)
JOIN auth.users u ON u.email = v.email
WHERE p.id = u.id;

-- ── Helper para las políticas ──────────────────────────────
-- SECURITY DEFINER para que no dependa de las políticas de `profiles`,
-- y search_path fijo para que no se le pueda colar otra tabla.
CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── Nadie se auto-asciende ─────────────────────────────────
-- "profiles: owner write" (migración 013) deja que cada quien edite su fila,
-- lo que incluiría `role`. Este trigger revierte cualquier cambio de rol que
-- venga de un usuario firmado; solo el service role (auth.uid() IS NULL:
-- scripts, SQL Editor) puede cambiarlo.
CREATE OR REPLACE FUNCTION protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role();

-- ── El alta de usuarios también trae el rol ────────────────
-- (extiende el trigger de la migración 015; sin `role` en el metadata la
-- persona entra como Socio Estratégico, que es lo más restringido)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'username',
    COALESCE(NEW.raw_user_meta_data->>'role', 'partner')
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        username  = COALESCE(EXCLUDED.username,  profiles.username),
        role      = COALESCE(EXCLUDED.role,      profiles.role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Facturas (cobros y pagos): solo el Dueño ───────────────
-- Reemplaza la política de equipo que puso la migración 013.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices: team full access" ON invoices;
DROP POLICY IF EXISTS "invoices: owner full access" ON invoices;
DROP POLICY IF EXISTS "invoices: role owner only" ON invoices;

CREATE POLICY "invoices: role owner only" ON invoices
  FOR ALL USING (is_owner()) WITH CHECK (is_owner());

-- Nota: `clients.billing_type` y `clients.billing_amount` viven en la tabla
-- de clientes, que sigue siendo compartida — RLS filtra filas, no columnas.
-- La app las deja en null antes de mandarlas al navegador de un Socio
-- Estratégico (src/lib/client-billing.ts → hideBilling). Si algún día hace
-- falta cerrarlo también en la base, el camino es una vista sin esas columnas.
