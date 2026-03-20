import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../../core/config.js";
import { resolveProjectPath } from "../../core/config.js";
import { logger } from "../../core/logger.js";
import type { IngressMessage, MessageAttachment } from "../../core/types.js";
import { extToMime, mimeToMediaType } from "../../core/ingress/media.js";
import type { MercuryCoreRuntime } from "../../core/runtime/runtime.js";
import type { ChatRequest, ChatResponse, ChatFileOutput } from "./models.js";
import type { ChatService } from "./interface.js";

export function createChatService(core: MercuryCoreRuntime): ChatService {
  return {
    async send(request) {
      const callerId = request.callerId?.trim() || "system";
      const authorName = request.authorName?.trim() || undefined;

      const attachments: MessageAttachment[] = [];
      if (request.files?.length) {
        const workspace = resolveProjectPath(core.config.workspaceDir);
        const inboxDir = path.join(workspace, "inbox");
        fs.mkdirSync(inboxDir, { recursive: true });

        for (const file of request.files) {
          try {
            const buffer = Buffer.from(file.data, "base64");
            const filename = `${Date.now()}-${file.name}`;
            const filePath = path.join(inboxDir, filename);
            fs.writeFileSync(filePath, buffer);

            const mimeType = extToMime(file.name);
            attachments.push({
              path: filePath,
              type: mimeToMediaType(mimeType),
              mimeType,
              filename: file.name,
              sizeBytes: buffer.length,
            });
          } catch (err) {
            logger.warn("Failed to save chat file", {
              name: file.name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      const conversationExternalId = `api:${callerId}`;
      core.services.conversations.create("api", conversationExternalId, "dm");

      const ingress: IngressMessage = {
        platform: "api",
        conversationExternalId,
        callerId,
        authorName,
        text: request.text.trim(),
        isDM: true,
        isReplyToBot: true,
        attachments,
      };

      const result = await core.handleMessage(ingress, "cli");

      if (result.action === "ignore") return { reply: "", files: [] };
      if (result.action === "deny") throw new Error(result.reason);

      const reply = result.result?.text ?? "";
      const egressFiles = result.result?.files ?? [];

      const outputFiles: ChatFileOutput[] = [];
      for (const f of egressFiles) {
        try {
          const buffer = fs.readFileSync(f.path);
          outputFiles.push({
            filename: f.filename,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            data: buffer.toString("base64"),
          });
        } catch (err) {
          logger.warn("Failed to read outbox file", {
            path: f.path,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return { reply, files: outputFiles };
    },
  };
}
