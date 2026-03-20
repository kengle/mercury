export const schema = `
  CREATE TABLE IF NOT EXISTS mutes (
    user_id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    reason TEXT,
    muted_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;
