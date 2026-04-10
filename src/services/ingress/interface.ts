import type { OutputFile } from "../../core/types.js";
import type { IncomingMessage } from "./models.js";

export interface MessageChannel {
  /** Send a text message (non-streaming) */
  send(text: string): Promise<void>;
  /** Send a message with file attachments */
  sendFiles(text: string, files: OutputFile[]): Promise<void>;
  /** Stream text in real-time (uses adapter.stream if available) */
  stream(textStream: AsyncIterable<string>): Promise<void>;
  /** Mark conversation as read */
  markRead(): Promise<void>;
  /** Show typing indicator */
  startTyping(): Promise<void>;
}

export interface IngressService {
  handleMessage(input: IncomingMessage, channel: MessageChannel): Promise<void>;
}
