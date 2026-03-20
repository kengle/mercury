export const schema = `
  CREATE TABLE IF NOT EXISTS extension_state (
    extension TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (extension, key)
  );
`;
