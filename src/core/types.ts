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

export interface ScheduledTask {
  id: number;
  cron: string | null;
  at: string | null;
  prompt: string;
  active: number;
  silent: number;
  nextRunAt: number;
  createdBy: string;
  conversationId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: number;
  platform: string;
  externalId: string;
  kind: string;
  observedTitle: string | null;
  paired: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface Role {
  platformUserId: string;
  role: string;
  grantedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConfigEntry {
  key: string;
  value: string;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Mute {
  platformUserId: string;
  expiresAt: number;
  reason: string | null;
  mutedBy: string;
  createdAt: number;
}

export interface ExtensionStateEntry {
  key: string;
  value: string;
}

export type TriggerMatch = "prefix" | "mention" | "always";

export interface TriggerConfig {
  match: TriggerMatch;
  patterns: string[];
  caseSensitive: boolean;
}

export interface MessageSender {
  send(text: string, conversationId: string, files?: OutputFile[]): Promise<void>;
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
