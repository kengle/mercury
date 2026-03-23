/**
 * WeCom (Enterprise WeChat) adapter for Mercury.
 *
 * Implements the Chat SDK Adapter interface for WeCom platform.
 * Uses @wecom/aibot-node-sdk for WebSocket communication.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  BaseMessage,
  WsFrame,
  WSClientOptions,
} from "@wecom/aibot-node-sdk";
import { WSClient } from "@wecom/aibot-node-sdk";
import type {
  Adapter,
  AdapterPostableMessage,
  ChatInstance,
  FetchOptions,
  FetchResult,
  Message,
  RawMessage,
  ThreadInfo,
} from "chat";
import { Message as ChatMessage } from "chat";
import type { MessageAttachment, OutputFile } from "../core/types.js";
import type { Logger } from "../core/logger.js";

export interface WeComAdapterOptions {
  botId: string;
  secret: string;
  userName?: string;
  /** Media file save directory (default: system temp directory) */
  mediaDir?: string;
}

export interface WeComThreadId {
  convId: string;
  chattype: string;
  reqId: string;
}

export class WeComAdapter implements Adapter<string, WsFrame<BaseMessage>> {
  readonly name = "wecom";
  readonly userName: string;

  private client?: WSClient;
  private chat?: ChatInstance;
  private readonly botId: string;
  private readonly secret: string;
  private readonly mediaDir: string;
  private readonly log: Logger;

  private connected = false;
  private connectedAtMs = 0;
  private readonly seenMessageIds = new Set<string>();

  constructor(options: WeComAdapterOptions) {
    this.botId = options.botId;
    this.secret = options.secret;
    this.userName = options.userName ?? "wecom-bot";
    this.mediaDir = options.mediaDir || path.join(os.tmpdir(), "wecom-inbox");
    this.log = options.log;

    fs.mkdirSync(this.mediaDir, { recursive: true });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** Initialize the adapter with Chat SDK ChatInstance */
  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const wsOptions: WSClientOptions = {
      botId: this.botId,
      secret: this.secret,
    };

    this.client = new WSClient(wsOptions);

    this.client.on("message", (frame: WsFrame<BaseMessage>) => {
      void this.handleMessage(frame);
    });

    this.client.on("connected", () => {
      this.log.info("[WeCom] WebSocket connected");
      this.connected = true;
      this.connectedAtMs = Date.now();
      this.seenMessageIds.clear();
    });

    this.client.on("disconnected", (reason) => {
      this.log.warn("[WeCom] disconnected", { reason });
      this.connected = false;
    });

    this.client.on("error", (err) =>
      this.log.error("[WeCom] error", { error: err.message }),
    );

    this.client.connect();
  }

  private async handleMessage(frame: WsFrame<BaseMessage>): Promise<void> {
    if (!this.chat || !frame.body || !frame.headers?.req_id) return;

    const reqId = frame.headers.req_id;

    if (this.seenMessageIds.has(reqId)) return;
    this.seenMessageIds.add(reqId);
    if (this.seenMessageIds.size > 5000) this.seenMessageIds.clear();

    const tsMs = frame.headers.timestamp ?? Date.now();
    if (this.connectedAtMs && tsMs < this.connectedAtMs - 10_000) return;

    const body = frame.body;
    const chattype = body.chattype ?? "single";
    const convId = body.chatid ?? body.from?.userid;
    if (!convId) return;

    const threadId = this.encodeThreadId({ convId, chattype, reqId });

    const { text, attachments } = await this.parseRawToMessage(frame);

    if (!text && attachments.length === 0) return;

    const message = new ChatMessage({
      id: `msg-${reqId}`,
      threadId,
      text: text || "[Media message]",
      raw: frame,
      isMention: true,
      author: {
        userId: body.from?.userid ?? "unknown",
        userName: body.from?.userid ?? "unknown",
        isBot: false,
        isMe: false,
      },
      metadata: { dateSent: new Date(tsMs), isReplyToBot: true },
      attachments,
    });

    this.chat.processMessage(this, threadId, message);
  }

  private async parseRawToMessage(
    frame: WsFrame<BaseMessage>,
  ): Promise<{ text: string; attachments: MessageAttachment[] }> {
    const body = frame.body;
    const msgtype = body.msgtype;
    let text = "";
    const attachments: MessageAttachment[] = [];

    switch (msgtype) {
      case "text":
        text = (body as any).text?.content || "";
        break;
      case "voice":
        text = (body as any).voice?.content || "[Voice message]";
        break;
      case "mixed": {
        const mixed = (body as any).mixed?.msg_item || [];
        for (const item of mixed) {
          if (item.msgtype === "text") {
            text += item.text?.content ?? "";
          } else if (item.msgtype === "image") {
            text += " [image]";
            attachments.push(...(await this.downloadMedia(item.image, "image")));
          }
        }
        text = text.trim();
        break;
      }
      case "image":
      case "file":
      case "video":
        attachments.push(...(await this.downloadMedia((body as any)[msgtype], msgtype)));
        text = `[Received ${msgtype} message]`;
        break;
      default:
        text = "";
    }

    return { text, attachments };
  }

  private async downloadMedia(
    mediaInfo: any,
    type: string,
  ): Promise<MessageAttachment[]> {
    if (!mediaInfo?.url || !this.client) return [];

    try {
      const { buffer } = await this.client.downloadFile(
        mediaInfo.url,
        mediaInfo.aeskey,
      );

      const ext = type === "image" ? "jpg" : type === "video" ? "mp4" : type === "voice" ? "ogg" : "bin";
      const filename = `${Date.now()}.${ext}`;
      const filePath = path.join(this.mediaDir, filename);
      fs.writeFileSync(filePath, buffer);

      const mimeType = type === "image" ? "image/jpeg" : type === "video" ? "video/mp4" : type === "voice" ? "audio/ogg" : "application/octet-stream";
      const mediaType = type === "image" ? "image" : type === "video" ? "video" : type === "voice" ? "voice" : "document";

      return [{ path: filePath, type: mediaType, mimeType, filename, sizeBytes: buffer.length }];
    } catch (e) {
      this.log.error("[WeCom] download failed", { error: (e as Error).message });
      return [];
    }
  }

  // ==================== Chat SDK Adapter Interface ====================
  isDM(threadId): boolean {
    const { isDM } = this.decodeThreadId(threadId);
    return isDM;
  }

  decodeThreadId(threadId: string): WeComThreadId {
    const [, convId, chattype, reqId] = threadId.split(":");
    return { convId, chattype, reqId, isDM: chattype === "single" };
  }

  encodeThreadId(platformData: WeComThreadId): string {
    const { convId, chattype, reqId } = platformData;
    return `wecom:${convId}:${chattype}:${reqId}`;
  }

  async onThreadSubscribe(_threadId: string): Promise<void> {
    // WeCom uses push model, no need to subscribe
  }

  async postMessage(
    threadId: string,
    msg: AdapterPostableMessage,
  ): Promise<RawMessage<WsFrame<BaseMessage>>> {
    const client = this.client;
    if (!client) {
      this.log.warn("[WeCom] Cannot send message - not connected");
      return { id: "error", threadId, raw: undefined };
    }

    const { convId: chatid } = this.decodeThreadId(threadId);
    const text = typeof msg === "string" ? msg : (msg as any).text || "";

    if (text) {
      await client.sendMessage(chatid, {
        msgtype: "markdown",
        markdown: { content: text },
      });
    }

    return { id: "ok", threadId, raw: undefined };
  }

  async fetchMessages(
    _threadId: string,
    _options?: FetchOptions,
  ): Promise<FetchResult> {
    return { messages: [] };
  }

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const { convId, isDM } = this.decodeThreadId(threadId);
    return { id: convId, channelId: convId, isDM, metadata: {} };
  }

  async startTyping(_threadId: string): Promise<void> {
    // WeCom doesn't support typing indicators
  }

  async addReaction(
    _threadId: string,
    _messageId: string,
    _emoji: any,
  ): Promise<void> {
    // WeCom doesn't support reactions
  }

  async removeReaction(
    _threadId: string,
    _messageId: string,
    _emoji: any,
  ): Promise<void> {
    // WeCom doesn't support reactions
  }

  async deleteMessage(
    _threadId: string,
    _messageId: string,
  ): Promise<void> {
    // WeCom doesn't support message deletion
  }

  async editMessage(
    _threadId: string,
    _messageId: string,
    _message: AdapterPostableMessage,
  ): Promise<RawMessage<WsFrame<BaseMessage>>> {
    // WeCom doesn't support message editing
    return { id: "unknown", threadId: "", raw: undefined };
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.connected = false;
      this.log.info("[WeCom] Disconnected");
    }
  }
}

export function createWeComAdapter(
  options: WeComAdapterOptions,
): WeComAdapter {
  return new WeComAdapter(options);
}
