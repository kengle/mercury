import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../../core/config.js";
import { resolveProjectPath } from "../../core/config.js";
import { extToMime, mimeToMediaType } from "../../core/ingress/media.js";
import { logger } from "../../core/logger.js";
import type { MercuryCoreRuntime } from "../../core/runtime/runtime.js";
import type { IngressMessage, MessageAttachment } from "../../core/types.js";
import type { ChatService } from "./interface.js";
import type { ChatFileOutput, ChatRequest, ChatResponse } from "./models.js";

export function createChatService(core: MercuryCoreRuntime): ChatService {
  return {
    async send(request) {
      const callerId = request.callerId?.trim() || "system";
      const authorName = request.authorName?.trim() || undefined;

      // Resolve workspace
      let workspaceId: number | undefined;
      let workspaceName: string | undefined;
      if (request.workspace && core.services.workspaces) {
        const ws = core.services.workspaces.get(request.workspace);
        if (ws) {
          workspaceId = ws.id;
          workspaceName = ws.name;
        }
      }

      const attachments: MessageAttachment[] = [];
      if (request.files?.length) {
        if (!workspaceName) {
          throw new Error(
            "Workspace is required when sending files. Specify 'workspace' in the request.",
          );
        }
        const wsDir = path.join(
          resolveProjectPath(core.config.workspacesDir),
          workspaceName,
        );
        const inboxDir = path.join(wsDir, "inbox");
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
      // Assign conversation to workspace if specified
      if (workspaceId !== undefined) {
        core.services.conversations.assignWorkspace(
          "api",
          conversationExternalId,
          workspaceId,
        );
      }

      const ingress: IngressMessage = {
        platform: "api",
        conversationExternalId,
        callerId,
        authorName,
        text: request.text.trim(),
        isDM: true,
        isReplyToBot: true,
        attachments,
        workspaceId,
        workspaceName,
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
