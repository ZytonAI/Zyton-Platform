-- ============================================================
-- Zyton Platform — Etiquetas de equipo + eventos personales
-- ============================================================
-- Hasta ahora todo el trabajo era anónimo: `owner_id` decía quién creó el
-- registro, pero no quién lo trabajó. Con cuatro personas eso ya no alcanza.
--
--   leads.contacted_by   — quién lo contactó
--   leads.closed_by      — quién lo cerró
--   leads.scheduled_by   — quién lo va a programar
--   clients.closed_by    — quién cerró al cliente
--   clients.scheduled_by — quién lo va a programar
--
-- Los valores son los slugs de src/lib/team.ts (samuel, camilo, …), igual que
-- `tasks.assignee`. NULL = sin asignar.
--
-- Además, los eventos del calendario pasan a tener visibilidad:
--   'team'     — lo ve todo el equipo (comportamiento actual, default)
--   'personal' — solo lo ve quien lo creó
-- ============================================================

-- ── Slugs válidos ──────────────────────────────────────────
-- Al cambiar el equipo, actualizar también src/lib/team.ts, 014_tasks.sql,
-- 015_usernames.sql, 017_roles.sql y scripts/create-users.mjs.
DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('leads',   'contacted_by'),
      ('leads',   'closed_by'),
      ('leads',   'scheduled_by'),
      ('clients', 'closed_by'),
      ('clients', 'scheduled_by')
    ) AS v(tbl, name)
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I TEXT', col.tbl, col.name);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', col.tbl, col.tbl || '_' || col.name || '_check');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I IN (''samuel'', ''camilo'', ''santiago'', ''daniel''))',
      col.tbl, col.tbl || '_' || col.name || '_check', col.name, col.name
    );
  END LOOP;
END $$;

-- El chat de WhatsApp se filtra por el lead/cliente de la conversación,
-- así que estos índices son los que sostienen esa vista.
CREATE INDEX IF NOT EXISTS idx_leads_contacted_by   ON leads(contacted_by);
CREATE INDEX IF NOT EXISTS idx_leads_closed_by      ON leads(closed_by);
CREATE INDEX IF NOT EXISTS idx_clients_closed_by    ON clients(closed_by);

-- ── Calendario: eventos personales vs grupales ─────────────
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'team';

ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_visibility_check;
ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_visibility_check CHECK (visibility IN ('team', 'personal'));

-- Lo ya existente sigue siendo del equipo (era lo que pasaba antes)
UPDATE calendar_events SET visibility = 'team' WHERE visibility IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_visibility ON calendar_events(visibility, event_date);

-- Un evento personal solo lo ve (y edita) quien lo creó. Reemplaza la política
-- de equipo que puso la migración 013.
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_events: team full access" ON calendar_events;
DROP POLICY IF EXISTS "calendar_events: owner full access" ON calendar_events;
DROP POLICY IF EXISTS "calendar_events: team or own personal" ON calendar_events;

CREATE POLICY "calendar_events: team or own personal" ON calendar_events
  FOR ALL
  USING (visibility = 'team' OR owner_id = auth.uid())
  WITH CHECK (visibility = 'team' OR owner_id = auth.uid());
