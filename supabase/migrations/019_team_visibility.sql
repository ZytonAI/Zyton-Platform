-- ============================================================
-- Zyton Platform — Wiki con autor y páginas personales
-- ============================================================
-- Segunda tanda de "esto ya no es de una sola persona":
--
--   workspace_pages.visibility — 'team' (default) o 'personal'
--   workspace_pages.updated_by — quién la tocó de último
--   wa_sessions                — deja de ser una sesión por usuario
-- ============================================================

-- ── Wiki: personal vs equipo ───────────────────────────────
ALTER TABLE workspace_pages
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'team';

ALTER TABLE workspace_pages DROP CONSTRAINT IF EXISTS workspace_pages_visibility_check;
ALTER TABLE workspace_pages
  ADD CONSTRAINT workspace_pages_visibility_check CHECK (visibility IN ('team', 'personal'));

-- Quién guardó por última vez (owner_id ya dice quién la creó)
ALTER TABLE workspace_pages
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wiki_visibility ON workspace_pages(visibility);

-- Una página personal solo la ve (y edita) quien la creó — mismo patrón que
-- los eventos del calendario en la migración 018.
ALTER TABLE workspace_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_pages: team full access" ON workspace_pages;
DROP POLICY IF EXISTS "workspace_pages: owner full access" ON workspace_pages;
DROP POLICY IF EXISTS "workspace_pages: team or own personal" ON workspace_pages;

CREATE POLICY "workspace_pages: team or own personal" ON workspace_pages
  FOR ALL
  USING (visibility = 'team' OR owner_id = auth.uid())
  WITH CHECK (visibility = 'team' OR owner_id = auth.uid());

-- ── WhatsApp: una sesión del workspace, no una por usuario ──
-- La tabla nació cuando cada quien conectaba su propio número. El código ya la
-- trata como una sola (getWorkspaceSession); esto alinea el esquema.
ALTER TABLE wa_sessions DROP CONSTRAINT IF EXISTS wa_sessions_owner_id_key;

-- Deja solo la fila más reciente: las demás son residuo del modelo viejo
DELETE FROM wa_sessions a
USING wa_sessions b
WHERE a.updated_at < b.updated_at;

-- Un índice sobre una constante garantiza que no vuelva a haber más de una fila.
-- Va en un bloque con manejo de error para que, si esta variante no le gusta a
-- la versión de Postgres del proyecto, no se caiga el resto de la migración.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_sessions_singleton ON wa_sessions ((true));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'No se pudo crear el índice singleton de wa_sessions: %', SQLERRM;
END $$;

COMMENT ON COLUMN wa_sessions.owner_id IS
  'Quién conectó el número por última vez. La sesión es del workspace, no suya.';
