export type MessageRole = "user" | "assistant" | "tool" | "ambient";

export type MediaType = "image" | "video" | "audio" | "voice" | "document";

export interface MessageAttachment {
  path: string;
  type: MediaType;
  mimeType: string;
  filename?: string;
  sizeBytes?: number;
}

export interface StoredMessage {
  id: number;
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
  createdAt: number;
  updatedAt: number;
}

export type TriggerMatch = "prefix" | "mention" | "always";

export interface TriggerConfig {
  match: TriggerMatch;
  patterns: string[];
  caseSensitive: boolean;
}

export interface MessageSender {
  send(
    text: string,
    conversationId: string,
    files?: OutputFile[],
  ): Promise<void>;
}

export interface IngressMessage {
  platform: string;
  conversationExternalId: string;
  callerId: string;
  authorName?: string;
  text: string;
  isDM: boolean;
  isReplyToBot: boolean;
  attachments: MessageAttachment[];
  workspaceId?: number;
  workspaceName?: string;
}

export interface OutputFile {
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AgentOutput {
  text: string;
  files: OutputFile[];
}
