-- Wiki: páginas con editor Notion-like
CREATE TABLE IF NOT EXISTS workspace_pages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'Sin título',
  content    JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
  parent_id  UUID REFERENCES workspace_pages(id) ON DELETE CASCADE,
  icon       TEXT NOT NULL DEFAULT '📄',
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE workspace_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_pages: owner full access" ON workspace_pages
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_wiki_owner  ON workspace_pages(owner_id);
CREATE INDEX IF NOT EXISTS idx_wiki_parent ON workspace_pages(owner_id, parent_id);
