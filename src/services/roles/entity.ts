export const schema = `
  CREATE TABLE IF NOT EXISTS roles (
    workspace_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    granted_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
  );
`;
