export const schema = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    conversation_id TEXT NOT NULL DEFAULT '',
    attachments TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_created
  ON messages(created_at);

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS session_boundaries (
    conversation_id TEXT PRIMARY KEY,
    min_message_id INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`;
