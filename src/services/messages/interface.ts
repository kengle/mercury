import type { MessageEntity, MessageAttachment, MessageRole } from "./models.js";

export interface MessageService {
  create(role: MessageRole, content: string, conversationId?: string, attachments?: MessageAttachment[]): void;
  list(conversationId: string, limit?: number): MessageEntity[];
  delete(id: number): boolean;
  getSessionBoundary(conversationId: string): number;
  setSessionBoundary(conversationId: string): number;
}
