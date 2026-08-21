-- ============================================================
-- Zyton Platform — To Do del equipo
-- ============================================================
-- Un tablero con una columna por persona: Samuel, Camilo, Santiago y Daniel.
-- Cada tarea tiene título, fecha y estado (sin hacer / en progreso / completado).
-- Es compartido: los 4 ven y editan el tablero completo.
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- quién la creó
  assignee     TEXT NOT NULL
                 CHECK (assignee IN ('samuel', 'camilo', 'santiago', 'daniel')),
  title        TEXT NOT NULL,
  description  TEXT,
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo', 'in_progress', 'done')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks: team full access" ON tasks;
CREATE POLICY "tasks: team full access" ON tasks
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_date);
