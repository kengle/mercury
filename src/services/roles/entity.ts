export const schema = `
  CREATE TABLE IF NOT EXISTS roles (
    user_id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    granted_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;
