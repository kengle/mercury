export const schema = `
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    external_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'group',
    observed_title TEXT,
    workspace_id INTEGER,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    UNIQUE(platform, external_id)
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_workspace
  ON conversations(workspace_id);
`;
