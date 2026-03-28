export const schema = `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    cron TEXT,
    at TEXT,
    prompt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    silent INTEGER NOT NULL DEFAULT 0,
    next_run_at INTEGER NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'system',
    conversation_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_next
  ON tasks(active, next_run_at);

  CREATE INDEX IF NOT EXISTS idx_tasks_workspace
  ON tasks(workspace_id);
`;
