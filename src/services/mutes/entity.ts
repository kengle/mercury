export const schema = `
  CREATE TABLE IF NOT EXISTS mutes (
    workspace_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    reason TEXT,
    muted_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
  );
`;
