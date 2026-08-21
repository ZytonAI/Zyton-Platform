-- ============================================================
-- Zyton Platform — Workspace de equipo (4 personas)
-- ============================================================
-- Antes: cada usuario solo veía sus propios registros (owner_id = auth.uid()).
-- Ahora: los 4 miembros del equipo comparten leads, clientes, facturas,
-- calendario, wiki, adjuntos y el chat de WhatsApp.
--
-- owner_id se conserva en todas las tablas como "quién lo creó" (autoría),
-- pero ya no restringe la visibilidad.
--
-- Se mantienen privados: diana_messages, diana_tasks, diana_action_log
-- (el historial de conversación con Diana es personal de cada usuario).
-- ============================================================

-- Helper: cualquier usuario autenticado del workspace
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN AS $$
  SELECT auth.uid() IS NOT NULL;
$$ LANGUAGE sql STABLE;

-- ── Tablas compartidas por todo el equipo ──────────────────
DO $$
DECLARE
  t TEXT;
  shared_tables TEXT[] := ARRAY[
    'leads',
    'lead_history',
    'clients',
    'client_history',
    'file_attachments',
    'invoices',
    'calendar_events',
    'workspace_pages',
    'conversations',
    'messages',
    'wa_sessions',
    'agents',
    'ai_agents'
  ];
BEGIN
  FOREACH t IN ARRAY shared_tables LOOP
    -- Saltar tablas que no existan en este proyecto
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || ': owner full access', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || ': team full access', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (is_team_member()) WITH CHECK (is_team_member())',
      t || ': team full access', t
    );
  END LOOP;
END $$;

-- ── PROFILES ───────────────────────────────────────────────
-- Todo el equipo puede leer los perfiles (para mostrar nombres y avatares),
-- pero cada quien solo edita el suyo.
DROP POLICY IF EXISTS "profiles: owner full access" ON profiles;
DROP POLICY IF EXISTS "profiles: team read"          ON profiles;
DROP POLICY IF EXISTS "profiles: owner write"        ON profiles;

CREATE POLICY "profiles: team read" ON profiles
  FOR SELECT USING (is_team_member());

CREATE POLICY "profiles: owner write" ON profiles
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ── Storage: adjuntos compartidos ──────────────────────────
-- Las políticas del bucket `attachments` estaban limitadas a la carpeta del
-- propio usuario. Ahora cualquier miembro autenticado puede leer/subir/borrar.
-- Va en un bloque con manejo de excepción porque en algunos proyectos el rol
-- del SQL Editor no es dueño de storage.objects; si falla, hay que crear las
-- tres políticas a mano en Dashboard > Storage > attachments > Policies.
DO $$
BEGIN
  DROP POLICY IF EXISTS "attachments: team select" ON storage.objects;
  DROP POLICY IF EXISTS "attachments: team insert" ON storage.objects;
  DROP POLICY IF EXISTS "attachments: team delete" ON storage.objects;

  CREATE POLICY "attachments: team select" ON storage.objects
    FOR SELECT USING (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

  CREATE POLICY "attachments: team insert" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

  CREATE POLICY "attachments: team delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permisos sobre storage.objects: crea las políticas del bucket attachments desde el Dashboard.';
END $$;

-- ── Conversaciones: unicidad por chat, no por dueño ────────
-- Antes cada usuario podía tener su propia fila para el mismo número.
-- Ahora el equipo comparte un solo WhatsApp, así que la conversación es una sola.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM conversations GROUP BY wa_chat_id HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Hay conversaciones duplicadas por wa_chat_id: se omite el índice único. Ejecuta /api/admin/merge-conversations y vuelve a correr esta migración.';
  ELSE
    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_owner_id_wa_chat_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_wa_chat ON conversations(wa_chat_id);
  END IF;
END $$;
