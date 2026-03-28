export const schema = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_created
  ON messages(created_at);

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_messages_workspace
  ON messages(workspace_id, conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS session_boundaries (
    workspace_id INTEGER NOT NULL,
    conversation_id TEXT NOT NULL,
    min_message_id INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, conversation_id)
  );
`;
