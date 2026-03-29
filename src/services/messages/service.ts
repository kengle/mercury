import type { Database } from "bun:sqlite";
import type { MessageService } from "./interface.js";
import type {
  MessageAttachment,
  MessageEntity,
  MessageRole,
} from "./models.js";

type MessageRow = {
  id: number;
  role: string;
  content: string;
  attachments: string | null;
  createdAt: number;
  updatedAt: number;
};

function parseRow(row: MessageRow): MessageEntity {
  let attachments: MessageAttachment[] | undefined;
  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments) as MessageAttachment[];
    } catch {
      attachments = undefined;
    }
  }
  return {
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    conversationId: "",
    attachments,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createMessageService(db: Database): MessageService {
  const insert = db.prepare<
    void,
    [number, string, string, string, string | null, number, number]
  >(
    `INSERT INTO messages(workspace_id, conversation_id, role, content, attachments, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const deleteById = db.prepare<void, [number]>(
    "DELETE FROM messages WHERE id = ?",
  );
  const selectBoundary = db.prepare<
    { min_message_id: number },
    [number, string]
  >(
    "SELECT min_message_id FROM session_boundaries WHERE workspace_id = ? AND conversation_id = ?",
  );
  const maxMsgId = db.prepare<{ id: number }, [number, string]>(
    "SELECT COALESCE(MAX(id), 0) as id FROM messages WHERE workspace_id = ? AND conversation_id = ?",
  );
  const upsertBoundary = db.prepare<void, [number, string, number, number]>(
    `INSERT INTO session_boundaries(workspace_id, conversation_id, min_message_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(workspace_id, conversation_id) DO UPDATE SET min_message_id = excluded.min_message_id, updated_at = excluded.updated_at`,
  );
  const latestUserMsg = db.prepare<{ id: number }, [number, string, number]>(
    "SELECT id FROM messages WHERE role = 'user' AND workspace_id = ? AND conversation_id = ? AND id > ? ORDER BY id DESC LIMIT 1",
  );
  const previousUserMsg = db.prepare<
    { id: number },
    [number, string, number, number]
  >(
    "SELECT id FROM messages WHERE role = 'user' AND workspace_id = ? AND conversation_id = ? AND id > ? AND id < ? ORDER BY id DESC LIMIT 1",
  );
  const selectAfter = db.prepare<MessageRow, [number, string, number, number]>(
    `SELECT id, role, content, attachments, created_at as createdAt, updated_at as updatedAt
     FROM messages WHERE workspace_id = ? AND conversation_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
  );

  return {
    create(workspaceId, conversationId, role, content, attachments) {
      const now = Date.now();
      const json = attachments?.length ? JSON.stringify(attachments) : null;
      insert.run(workspaceId, conversationId, role, content, json, now, now);
    },
    list(workspaceId, conversationId, limit = 200) {
      const boundary =
        selectBoundary.get(workspaceId, conversationId)?.min_message_id ?? 0;
      const latest = latestUserMsg.get(workspaceId, conversationId, boundary);
      if (!latest) return [];
      const previous = previousUserMsg.get(
        workspaceId,
        conversationId,
        boundary,
        latest.id,
      );
      const afterId = previous?.id ?? boundary;
      return selectAfter
        .all(workspaceId, conversationId, afterId, limit)
        .map(parseRow);
    },
    delete(id) {
      return deleteById.run(id).changes > 0;
    },
    getSessionBoundary(workspaceId, conversationId) {
      return (
        selectBoundary.get(workspaceId, conversationId)?.min_message_id ?? 0
      );
    },
    setSessionBoundary(workspaceId, conversationId) {
      const minMessageId = Number(
        maxMsgId.get(workspaceId, conversationId)?.id ?? 0,
      );
      upsertBoundary.run(workspaceId, conversationId, minMessageId, Date.now());
      return minMessageId;
    },
  };
}
