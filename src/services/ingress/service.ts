import path from "node:path";
import {
  type AppConfig,
  loadWorkspaceConfig,
  mergeWorkspaceConfig,
  resolveProjectPath,
} from "../../core/config.js";
import { handleCommand } from "../../core/ingress/commands.js";
import { loadTriggerConfig, matchTrigger } from "../../core/ingress/trigger.js";
import type { Logger } from "../../core/logger.js";
import type { MercuryCoreRuntime } from "../../core/runtime/runtime.js";
import type { IngressMessage } from "../../core/types.js";
import type { IngressService, MessageChannel } from "./interface.js";
import type { IncomingMessage } from "./models.js";

export function createIngressService(
  core: MercuryCoreRuntime,
  config: AppConfig,
  log: Logger,
): IngressService {
  return {
    async handleMessage(
      input: IncomingMessage,
      channel: MessageChannel,
    ): Promise<void> {
      const {
        platform,
        externalId,
        callerId,
        authorName,
        text,
        isDM,
        isMention,
        attachments,
      } = input;

      if (!text) return;

      // ─── Resolve workspace from conversation ──────────────────────────
      let workspaceId = core.services.conversations.getWorkspaceId(
        platform,
        externalId,
      );
      let assigned = workspaceId != null;

      // ─── Unassigned: auto-pair or /pair command ───────────────────────
      if (!assigned) {
        // Auto-pair for DMs: create dedicated workspace automatically
        if (isDM) {
          const workspaceName = `ws-${platform}-${callerId}`;
          let workspace = core.services.workspaces.get(workspaceName);

          if (!workspace) {
            try {
              workspace = core.services.workspaces.create(workspaceName);
              log.info("Auto-created dedicated workspace for conversation", {
                callerId,
                externalId,
                platform,
                isDM,
                workspace: workspaceName,
              });
            } catch (err) {
              log.error("Failed to auto-create workspace", {
                workspaceName,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          if (workspace) {
            // Ensure conversation exists in DB
            core.services.conversations.create(
              platform,
              externalId,
              isDM ? "dm" : "group",
            );
            // Assign conversation to auto-created workspace
            core.services.conversations.assignWorkspace(
              platform,
              externalId,
              workspace.id,
            );
            // Set caller as admin
            core.services.roles.set(workspace.id, callerId, "admin", "auto-pair");
            workspaceId = workspace.id;
            assigned = true;
            log.info("Auto-paired conversation to workspace", {
              callerId,
              workspace: workspace.name,
            });
          }
        }

        // If still not assigned, check for /pair command
        if (!assigned) {
          if (!text.startsWith("/pair ")) {
            log.info("Unassigned conversation, ignoring", {
              platform,
              externalId,
            });
            return;
          }

          // Ensure conversation exists in DB
          core.services.conversations.create(
            platform,
            externalId,
            isDM ? "dm" : "group",
          );
          const code = text.slice(6).trim().toUpperCase();

          const ws = core.services.workspaces.findByPairingCode(code);
          if (ws) {
            core.services.workspaces.regeneratePairingCode(ws.id);
            core.services.conversations.assignWorkspace(
              platform,
              externalId,
              ws.id,
            );
            if (isDM) {
              core.services.roles.set(ws.id, callerId, "admin", "pair");
              await channel.send(
                `✅ Paired to workspace "${ws.name}". You are now an admin.`,
              );
              log.info("DM paired to workspace", {
                callerId,
                workspace: ws.name,
              });
            } else {
              await channel.send(
                `✅ Paired to workspace "${ws.name}". This conversation is now active.`,
              );
              log.info("Conversation paired to workspace", {
                platform,
                externalId,
                workspace: ws.name,
              });
            }
          } else {
            await channel.send("❌ Invalid pairing code.");
          }
          return;
        }
      }

      // ─── Assigned to workspace from here ──────────────────────────────
      const workspace = core.services.workspaces.getById(workspaceId);
      if (!workspace) {
        log.warn("Conversation assigned to non-existent workspace", {
          platform,
          externalId,
          workspaceId,
        });
        return;
      }
      const workspaceName = workspace.name;

      // Load workspace-specific config for trigger matching
      const wsDir = path.join(
        resolveProjectPath(config.workspacesDir),
        workspaceName,
      );
      const wsOverrides = loadWorkspaceConfig(wsDir);
      const effectiveConfig = mergeWorkspaceConfig(config, wsOverrides);

      try {
        await channel.markRead();
      } catch {}
      core.services.conversations.create(
        platform,
        externalId,
        isDM ? "dm" : "group",
      );

      // ─── Check if addressed to bot via mention or trigger pattern ─────
      let effectiveMention = isMention || isDM;

      if (!effectiveMention && !isDM) {
        const triggerConfig = loadTriggerConfig(
          core.services.config,
          {
            patterns: effectiveConfig.triggerPatterns.split(","),
            match: effectiveConfig.triggerMatch,
          },
          workspaceId,
        );
        const result = matchTrigger(text, triggerConfig, false);
        if (result.matched) {
          effectiveMention = true;
        }
      }

      // ─── Slash commands (only when addressed to bot) ────────────────────
      const slashMatch = text.match(/(?:^|\s)(\/\S+.*)/);
      const slashText = slashMatch ? slashMatch[1].trim() : null;
      if (slashText && effectiveMention) {
        if (slashText === "/unpair") {
          const isAdmin =
            core.services.roles.get(workspaceId, callerId) === "admin";
          if (!isAdmin) {
            await channel.send("⛔ Admin only.");
            return;
          }
          core.services.conversations.unassignWorkspace(platform, externalId);
          await channel.send("✅ Unpaired. I will no longer respond here.");
          log.info("Conversation unpaired", {
            platform,
            externalId,
            workspace: workspaceName,
          });
          return;
        }

        const isAdmin =
          core.services.roles.get(workspaceId, callerId) === "admin";
        if (!isAdmin) {
          await channel.send("⛔ Admin only.");
          return;
        }

        const cmd = await handleCommand(
          core,
          slashText,
          isDM,
          callerId,
          externalId,
          workspaceId,
          workspaceName,
        );
        if (cmd.handled) {
          if (cmd.reply) await channel.send(cmd.reply);
          return;
        }
      }

      if (!effectiveMention) {
        log.info("Ambient message", { callerId, authorName, text });
        const ambientText = authorName
          ? `${authorName}: ${text.trim()}`
          : text.trim();
        if (ambientText) {
          core.services.messages.create(
            workspaceId,
            externalId,
            "ambient",
            ambientText,
          );
        }
        return;
      }

      log.info("Addressed to bot", {
        callerId,
        authorName,
        isDM,
        isMention,
        text,
        workspace: workspaceName,
      });

      // ─── Addressed to bot: run through policy → agent ─────────────────
      try {
        await channel.startTyping();
      } catch {}

      const ingress: IngressMessage = {
        platform,
        conversationExternalId: externalId,
        callerId,
        authorName,
        text,
        isDM,
        isReplyToBot: effectiveMention,
        attachments,
        workspaceId,
        workspaceName,
      };

      void (async () => {
        try {
          const result = await core.handleMessage(ingress, "chat-sdk");

          if (result.action === "ignore" || !result.result) return;
          if (result.action === "deny") {
            await channel.send(result.reason);
            return;
          }

          const { text: replyText, files } = result.result;
          if (!replyText && files.length === 0) return;

          if (files.length > 0) {
            await channel.sendFiles(replyText, files);
          } else if (replyText) {
            await channel.send(replyText);
          }
        } catch (err) {
          log.error("Agent processing error", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    },
  };
}
