import type {
  MessageAttachment,
  MessageEntity,
  MessageRole,
} from "./models.js";

export interface MessageService {
  create(
    workspaceId: number,
    conversationId: string,
    role: MessageRole,
    content: string,
    attachments?: MessageAttachment[],
  ): void;
  list(
    workspaceId: number,
    conversationId: string,
    limit?: number,
  ): MessageEntity[];
  delete(id: number): boolean;
  getSessionBoundary(workspaceId: number, conversationId: string): number;
  setSessionBoundary(workspaceId: number, conversationId: string): number;
}
