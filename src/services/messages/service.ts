import type { Database } from "bun:sqlite";
import type { MessageEntity, MessageAttachment, MessageRole } from "./models.js";
import type { MessageService } from "./interface.js";

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
  const insert = db.prepare<void, [string, string, string, string | null, number, number]>(
    `INSERT INTO messages(role, content, conversation_id, attachments, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const deleteById = db.prepare<void, [number]>("DELETE FROM messages WHERE id = ?");
  const selectBoundary = db.prepare<{ min_message_id: number }, [string]>(
    "SELECT min_message_id FROM session_boundaries WHERE conversation_id = ?",
  );
  const maxMsgId = db.prepare<{ id: number }, [string]>(
    "SELECT COALESCE(MAX(id), 0) as id FROM messages WHERE conversation_id = ?",
  );
  const upsertBoundary = db.prepare<void, [string, number, number]>(
    `INSERT INTO session_boundaries(conversation_id, min_message_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET min_message_id = excluded.min_message_id, updated_at = excluded.updated_at`,
  );
  const latestUserMsg = db.prepare<{ id: number }, [string, number]>(
    "SELECT id FROM messages WHERE role = 'user' AND conversation_id = ? AND id > ? ORDER BY id DESC LIMIT 1",
  );
  const previousUserMsg = db.prepare<{ id: number }, [string, number, number]>(
    "SELECT id FROM messages WHERE role = 'user' AND conversation_id = ? AND id > ? AND id < ? ORDER BY id DESC LIMIT 1",
  );
  const selectAfter = db.prepare<MessageRow, [string, number, number]>(
    `SELECT id, role, content, attachments, created_at as createdAt, updated_at as updatedAt
     FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
  );

  return {
    create(role, content, conversationId = "", attachments) {
      const now = Date.now();
      const json = attachments?.length ? JSON.stringify(attachments) : null;
      insert.run(role, content, conversationId, json, now, now);
    },
    list(conversationId, limit = 200) {
      const boundary = selectBoundary.get(conversationId)?.min_message_id ?? 0;
      const latest = latestUserMsg.get(conversationId, boundary);
      if (!latest) return [];
      const previous = previousUserMsg.get(conversationId, boundary, latest.id);
      const afterId = previous?.id ?? boundary;
      return selectAfter.all(conversationId, afterId, limit).map(parseRow);
    },
    delete(id) {
      return deleteById.run(id).changes > 0;
    },
    getSessionBoundary(conversationId) {
      return selectBoundary.get(conversationId)?.min_message_id ?? 0;
    },
    setSessionBoundary(conversationId) {
      const minMessageId = Number(maxMsgId.get(conversationId)?.id ?? 0);
      upsertBoundary.run(conversationId, minMessageId, Date.now());
      return minMessageId;
    },
  };
}
