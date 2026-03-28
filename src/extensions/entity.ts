export const schema = `
  CREATE TABLE IF NOT EXISTS extension_state (
    workspace_id INTEGER NOT NULL,
    extension TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, extension, key)
  );
`;
