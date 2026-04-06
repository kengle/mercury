import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLlmFunctions, Markit, type MarkitOptions } from "markit-ai";
import type { AppConfig } from "../../core/config.js";
import { resolveProjectPath } from "../../core/config.js";
import {
  getCallerId,
  getPlatformFromThreadId,
} from "../../core/ingress/chatsdk.js";
import type { Logger } from "../../core/logger.js";
import type { MessageAttachment, OutputFile } from "../../core/types.js";
import type { ConversationService } from "../conversations/interface.js";
import type { WorkspaceService } from "../workspaces/interface.js";
import type { IngressService, MessageChannel } from "./interface.js";
import type { IncomingMessage } from "./models.js";

export function createChatSdkAdapter(opts: {
  ingress: IngressService;
  config: AppConfig;
  log: Logger;
  adapters: Record<string, any>;
  conversations: ConversationService;
  workspaces: WorkspaceService;
}) {
  const { ingress, config, log, adapters, conversations, workspaces } = opts;

  return async (
    thread: any,
    message: any,
    isMention: boolean,
  ): Promise<string | null> => {
    try {
      if (message.author.isMe) return null;

      const text = (message.text || "").trim();
      const hasAttachments =
        message.attachments && message.attachments.length > 0;
      if (!text && !hasAttachments) return null;

      const threadId = thread.id || "";
      const platform = getPlatformFromThreadId(threadId);
      const externalId = thread.channelId || threadId;
      const isDM = thread.isDM === true;
      const callerId = getCallerId(platform, message.author);
      const authorName = message.author.userName || message.author.fullName;

      const effectiveMention = isMention;

      log.info("Message received", {
        platform,
        callerId,
        authorName,
        text,
        isDM,
        isMention,
        effectiveMention,
        attachments: message.attachments?.length ?? 0,
      });

      const cleanText = text;

      // Resolve workspace inbox for attachments
      const wsId = conversations.getWorkspaceId(platform, externalId);
      let inboxDir: string;
      if (wsId != null) {
        const ws = workspaces.getById(wsId);
        if (ws) {
          inboxDir = join(
            resolveProjectPath(config.workspacesDir),
            ws.name,
            "inbox",
          );
        } else {
          inboxDir = join(resolveProjectPath(config.projectRoot), "inbox");
        }
      } else {
        // Unassigned conversation — download to project-level inbox (will be ignored anyway)
        inboxDir = join(resolveProjectPath(config.projectRoot), "inbox");
      }

      // Download attachments and transcribe audio
      const attachments = await downloadAttachments(
        message.attachments,
        inboxDir,
        log,
      );
      const transcription = await transcribeAudio(attachments, log);
      const messageText = transcription
        ? cleanText
          ? `${cleanText}\n\n[Voice note transcription: ${transcription}]`
          : `[Voice note transcription: ${transcription}]`
        : cleanText;

      const incoming: IncomingMessage = {
        platform,
        externalId,
        callerId,
        authorName,
        text: messageText,
        isDM,
        isMention: effectiveMention,
        attachments,
      };

      const channel = createChannel(thread, threadId, platform, adapters, log);

      await ingress.handleMessage(incoming, channel);
      return null;
    } catch (err) {
      log.error("Message handler error", {
        threadId: thread.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };
}

function createChannel(
  thread: any,
  threadId: string,
  platform: string,
  adapters: Record<string, any>,
  log: Logger,
): MessageChannel {
  return {
    async send(text: string) {
      await thread.post(text);
    },
    async sendFiles(text: string, files: OutputFile[]) {
      const adapter = adapters[platform];
      if (platform === "wecom") {
        // WeCom adapter has its own postMessage method
        await adapter.postMessage(threadId, { text, files });
      } else {
        const fileUploads = files.map((f) => ({
          filename: f.filename,
          data: readFileSync(f.path),
          mimeType: f.mimeType,
        }));
        await thread.post({ raw: text || "", files: fileUploads });
      }
    },
    async markRead() {
      const adapter = adapters[platform];
      if (adapter?.markRead) {
        await adapter.markRead(threadId);
      }
    },
    async startTyping() {
      await thread.startTyping();
    },
  };
}

async function downloadAttachments(
  attachments: any[] | undefined,
  inboxDir: string,
  log: Logger,
): Promise<MessageAttachment[]> {
  if (!attachments || attachments.length === 0) return [];

  mkdirSync(inboxDir, { recursive: true });

  const results: MessageAttachment[] = [];

  for (const att of attachments) {
    try {
      let data: Buffer | undefined;
      if (att.data) {
        data = Buffer.isBuffer(att.data) ? att.data : Buffer.from(att.data);
      } else if (att.fetchData) {
        data = await att.fetchData();
      }
      if (!data) continue;

      const filename =
        att.name ||
        att.filename ||
        `attachment_${Date.now()}.${att.mimeType?.split("/")[1] || "bin"}`;
      const filePath = join(inboxDir, filename);
      writeFileSync(filePath, data);

      results.push({
        path: filePath,
        type: (att.type === "image"
          ? "image"
          : att.type === "audio"
            ? "audio"
            : att.type === "video"
              ? "video"
              : "document") as any,
        mimeType: att.mimeType || "application/octet-stream",
        filename,
        sizeBytes: data.length,
      });
    } catch (err) {
      log.warn("Failed to download attachment", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

let markitInstance: Markit | null = null;

function getMarkit(): Markit | null {
  if (markitInstance) return markitInstance;
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const opts = createLlmFunctions({ llm: { provider: "openai" } });
    markitInstance = new Markit(opts);
    return markitInstance;
  } catch {
    return null;
  }
}

async function transcribeAudio(
  attachments: MessageAttachment[],
  log: Logger,
): Promise<string | null> {
  const audio = attachments.find((a) => a.type === "audio");
  if (!audio) return null;

  const markit = getMarkit();
  if (!markit) return null;

  try {
    const buffer = readFileSync(audio.path);
    const result = await markit.convert(buffer, {
      mimetype: audio.mimeType,
      filename: audio.filename,
    });
    const text = result.markdown.trim();
    if (!text) return null;
    log.info("Transcribed audio", {
      filename: audio.filename,
      length: text.length,
    });
    return text;
  } catch (err) {
    log.warn("Audio transcription failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}


