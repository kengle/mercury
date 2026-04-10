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
  FileUpload,
  Message,
  RawMessage,
  ThreadInfo,
} from "chat";
import { Message as ChatMessage } from "chat";
import type { MessageAttachment } from "../core/types.js";
import type { Logger } from "../core/logger.js";
import { resolveProjectPath } from "../core/config.js";

export interface WeComAdapterOptions {
  botId: string;
  secret: string;
  userName?: string;
  /** Workspace directory for storing media files in inbox/ */
  workspaceDir?: string;
  log: Logger;
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
  private readonly workspaceDir?: string;
  private readonly log: Logger;

  private connected = false;
  private connectedAtMs = 0;
  private readonly seenMessageIds = new Set<string>();

  constructor(options: WeComAdapterOptions) {
    this.botId = options.botId;
    this.secret = options.secret;
    this.userName = options.userName ?? "wecom-bot";
    this.workspaceDir = options.workspaceDir;
    this.log = options.log;
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
      // Text and voice messages: extract content directly (no download needed)
      case "text": {
        text = (body as { text?: { content?: string } }).text?.content || "";
        break;
      }

      case "voice": {
        // WeCom provides automatic speech-to-text
        const voiceInfo = (body as { voice?: { content?: string } }).voice;
        text = voiceInfo?.content || "[未识别的语音消息]";
        break;
      }

      // Per WeCom docs: mixed contains text + image items
      // Need to extract text and download images
      case "mixed": {
        const mixedBody = body as any;
        const mixed: any = mixedBody.mixed;
        if (!mixed?.msg_item) {
          this.log.warn("WeCom: mixed message without msg_item", { body });
          return { text: "", attachments: [] };
        }

        // Process each item in the mixed message
        for (const item of mixed.msg_item) {
          if (item.msgtype === "text") {
            text += item.text?.content ?? "";
          } else if (item.msgtype === "image") {
            // Download image from mixed message
            const downloaded = await this.downloadMedia(item.image, "image");
            if (downloaded.length > 0) {
              attachments.push(...downloaded);
            } else {
              text += "[未接受成功图片]";
            }
          }
        }
        text = text.trim();
        break;
      }

      // Per WeCom docs:
      // - image/file/video: have url + aeskey, need download + decryption
      // - voice: already includes text transcription in voice.content, no download needed
      case "image":
      case "file":
      case "video": {
        const mediaInfo = (body as Record<string, unknown>)[msgtype] as
          | { url?: string; aeskey?: string }
          | undefined;
        if (!mediaInfo?.url) {
          this.log.warn("WeCom: media message without URL", { msgtype, body });
          return { text: `[收到 ${msgtype}，请稍候]`, attachments: [] };
        }

        // Download and decrypt media using WeCom SDK
        const downloaded = await this.downloadMedia(mediaInfo, msgtype);
        if (downloaded.length > 0) {
          attachments.push(...downloaded);
        }
        text = `[收到 ${msgtype}，请稍候]`;
        break;
      }

      default:
        this.log.warn("WeCom: unsupported msgtype", { msgtype });
        text = "";
    }

    return { text, attachments };
  }

  private async downloadMedia(
    mediaInfo: any,
    type: string,
  ): Promise<MessageAttachment[]> {
    if (!mediaInfo?.url || !this.client) return [];

    // Resolve workspace and inbox directory
    let inboxDir: string;
    if (this.workspaceDir) {
      const workspace = resolveProjectPath(this.workspaceDir);
      inboxDir = path.join(workspace, "inbox");
    } else {
      // Fallback to temp dir if workspace not configured
      inboxDir = path.join(os.tmpdir(), "wecom-inbox");
    }
    fs.mkdirSync(inboxDir, { recursive: true });

    try {
      // WeCom SDK downloadFile handles both download and AES-256-CBC decryption
      const { buffer } = await this.client.downloadFile(
        mediaInfo.url,
        mediaInfo.aeskey,
      );

      // Generate local filename with msgid if available
      // Extract extension from URL if available, otherwise use default
      const urlExt = mediaInfo.url.split('?')[0].split('/').pop()?.split('.').pop();
      const ext =
        type === "image"
          ? "jpg"
          : type === "video"
            ? "mp4"
            : urlExt && urlExt.length <= 5
              ? urlExt
              : "bin";
      const filename = `${Date.now()}.${ext}`;
      const filePath = path.join(inboxDir, filename);
      fs.writeFileSync(filePath, buffer);

      const mimeType =
        type === "image"
          ? "image/jpeg"
          : type === "video"
            ? "video/mp4"
            : "application/octet-stream";

      const mediaType =
        type === "image" ? "image" : type === "video" ? "video" : "document";

      this.log.info("WeCom: media downloaded and decrypted", {
        type,
        sizeBytes: buffer.length,
        path: filePath,
      });

      return [{ path: filePath, type: mediaType, mimeType, filename, sizeBytes: buffer.length }];
    } catch (e) {
      this.log.error("WeCom: failed to download/decrypt media", {
        error: (e as Error).message,
      });
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

  channelIdFromThreadId(threadId: string): string {
    const { convId } = this.decodeThreadId(threadId);
    return convId;
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

    const { convId: chatid, reqId } = this.decodeThreadId(threadId);
    
    // Parse AdapterPostableMessage correctly
    // Can be: string | { raw: string, files?: FileUpload[] } | { markdown: string, files?: FileUpload[] } | etc.
    let text = "";
    let files: FileUpload[] | undefined;
    
    if (typeof msg === "string") {
      text = msg;
    } else if ("raw" in msg) {
      text = msg.raw || "";
      files = msg.files;
    } else if ("markdown" in msg) {
      text = msg.markdown || "";
      files = msg.files;
    } else if ("type" in msg && msg.type === "card") {
      // Card messages not supported with files
      text = "";
    }

    // Check if this is an active push message (scheduler) or a reply
    const isActivePush = reqId.startsWith("sched-");

    try {
      if (isActivePush) {
        // Active push: use sendMessage/sendMediaMessage (aibot_send_msg)
        this.log.debug("[WeCom] sending active push message", { chatid, reqId });

        // Send text using sendMessage
        if (text) {
          await client.sendMessage(chatid, {
            msgtype: "markdown",
            markdown: { content: text },
          });
        }

        // Send files using uploadMedia + sendMediaMessage
        if (files && files.length > 0) {
          for (const file of files) {
            try {
              // FileUpload has data as Buffer, no need to read from path
              const fileBuffer = file.data as Buffer;

              const mediaType =
                file.mimeType?.startsWith("image/")
                  ? "image"
                  : file.mimeType?.startsWith("video/")
                    ? "video"
                    : file.mimeType?.startsWith("audio/")
                      ? "voice"
                      : "file";

              const uploadResult = await client.uploadMedia(fileBuffer, {
                type: mediaType,
                filename: file.filename,
              });

              this.log.info("WeCom: file uploaded for active push", {
                filename: file.filename,
                mediaType,
                mediaId: uploadResult.media_id,
              });

              await client.sendMediaMessage(chatid, mediaType, uploadResult.media_id);

              this.log.info("WeCom: file sent via active push", {
                filename: file.filename,
                mediaType,
              });
            } catch (error) {
              this.log.error("WeCom: failed to send file via active push", {
                filename: file.filename,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      } else {
        // Reply to user message: use replyStream/replyMedia (aibot_respond_msg)
        this.log.debug("[WeCom] sending reply message", { chatid, reqId });

        const frame = { headers: { req_id: reqId } };

        // Send text reply using replyStream for markdown support
        if (text) {
          const streamId = `stream-${reqId}`;
          await client.replyStream(frame, streamId, text, true);
        }

        // Send files using uploadMedia + replyMedia
        if (files && files.length > 0) {
          for (const file of files) {
            try {
              // FileUpload has data as Buffer, no need to read from path
              const fileBuffer = file.data as Buffer;

              const mediaType =
                file.mimeType?.startsWith("image/")
                  ? "image"
                  : file.mimeType?.startsWith("video/")
                    ? "video"
                    : file.mimeType?.startsWith("audio/")
                      ? "voice"
                      : "file";

              const uploadResult = await client.uploadMedia(fileBuffer, {
                type: mediaType,
                filename: file.filename,
              });

              this.log.info("WeCom: file uploaded for reply", {
                filename: file.filename,
                mediaType,
                mediaId: uploadResult.media_id,
              });

              await client.replyMedia(frame, mediaType, uploadResult.media_id);

              this.log.info("WeCom: file sent via reply", {
                filename: file.filename,
                mediaType,
              });
            } catch (error) {
              this.log.error("WeCom: failed to send file via reply", {
                filename: file.filename,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }

      return { id: "ok", threadId, raw: undefined };
    } catch (error) {
      this.log.error("WeCom: failed to send message", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { id: "error", threadId, raw: undefined };
    }
  }

  /**
   * Stream a message using WeCom's native replyStream API.
   * Consumes the async iterable and sends chunks in real-time.
   */
  async stream(
    threadId: string,
    textStream: AsyncIterable<string>,
    _options?: any,
  ): Promise<RawMessage<WsFrame<BaseMessage>>> {
    const client = this.client;
    if (!client) {
      this.log.warn("[WeCom] Cannot stream message - not connected");
      return { id: "error", threadId, raw: undefined };
    }

    const { convId: chatid, reqId } = this.decodeThreadId(threadId);
    const frame = { headers: { req_id: reqId } };
    const streamId = `stream-${reqId}`;

    // Send each chunk immediately as it arrives
    // WeCom replyStream can be called multiple times
    // Last chunk must have finish=true
    let chunkCount = 0;
    
    try {
      this.log.info("[WeCom.stream] Starting to consume chunks");
      
      // Accumulate chunks and send progressively
      let cache = "";
      for await (const chunk of textStream) {
        chunkCount++;
        cache += chunk;
        this.log.debug("[WeCom.stream] Received chunk, sending accumulated cache", { 
          chunkCount,
          chunk: chunk.slice(0, 50),
          cacheLength: cache.length 
        });
        
        // Send entire cache with finish=false (more content coming)
        await client.replyStream(frame, streamId, cache, false);
      }

      // Send final cache with finish=true (no more content)
      this.log.info("[WeCom.stream] Generator completed, sending final cache with finish=true", { 
        chunkCount, 
        cacheLength: cache.length 
      });
      await client.replyStream(frame, streamId, cache, true);
      this.log.info("[WeCom.stream] Final message sent with finish=true");

      this.log.info("[WeCom] streaming complete", { chatid, reqId, chunkCount });
      return { id: `msg-${reqId}`, threadId, raw: undefined };
    } catch (error) {
      this.log.error("WeCom: streaming failed", {
        error: error instanceof Error ? error.message : String(error),
        chunkCount,
      });
      // Try to end the stream even on error
      try {
        await client.replyStream(frame, streamId, "", true);
        this.log.info("[WeCom.stream] Error handler sent finish=true");
      } catch (e) {
        this.log.error("[WeCom.stream] Failed to send finish=true", { error: e });
      }
      return { id: "error", threadId, raw: undefined };
    }
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
