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

      // ─── Auto-pair: create dedicated workspace for new conversations ───
      if (!assigned) {
        const workspaceName = isDM
          ? `ws-${platform}-${callerId}`
          : `ws-${platform}-group-${externalId}`;
        
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
          const workspaceId = workspace.id;

          // Ensure conversation exists in DB
          core.services.conversations.create(
            platform,
            externalId,
            isDM ? "dm" : "group",
          );

          // Bind conversation to dedicated workspace (strict 1:1)
          if (!core.services.conversations.isAssigned(platform, externalId)) {
            const success = core.services.conversations.assignWorkspace(
              platform,
              externalId,
              workspaceId,
            );

            if (success) {
              log.info("Auto-paired conversation to dedicated workspace", {
                callerId,
                externalId,
                isDM,
                workspace: workspaceName,
              });
            }
          }

          // Auto-grant role based on conversation type
          // For groups, check if message contains /pair <code> to grant admin
          let targetRole = isDM ? "admin" : "member";
          let roleSource = `auto-pair-${isDM ? "dm" : "group"}`;

          // Check for /pair <code> in group messages
          if (!isDM) {
            const pairMatch = text.match(/\/pair\s+([A-Za-z0-9]+)/i);
            if (pairMatch) {
              const code = pairMatch[1].trim().toUpperCase();
              const wsFromCode = core.services.workspaces.findByPairingCode(code);
              
              if (wsFromCode && wsFromCode.id === workspaceId) {
                targetRole = "admin";
                roleSource = `auto-pair-code-${code}`;
                core.services.workspaces.regeneratePairingCode(workspaceId);
                log.info("Auto-granted admin role via /pair code in group message", {
                  callerId,
                  workspace: workspaceName,
                  code,
                });
              }
            }
          }

          if (core.services.roles.get(workspaceId, callerId) !== targetRole) {
            core.services.roles.set(
              workspaceId,
              callerId,
              targetRole,
              roleSource,
            );

            log.info(`Auto-granted ${targetRole} role for conversation`, {
              callerId,
              externalId,
              workspace: workspaceName,
              isDM,
            });
          }

          assigned = true;
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
        // ─── /unpair: unassign conversation from workspace ────────────────
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

        // ─── /pair <code>: grant admin role for group conversations ───────
        // Note: This is a fallback for when auto-pair didn't process the code
        if (slashText.startsWith("/pair ")) {
          // Only allow /pair in group conversations
          if (isDM) {
            await channel.send("⛔ /pair is only available in group conversations.");
            return;
          }

          const code = slashText.slice(6).trim().toUpperCase();
          const ws = core.services.workspaces.findByPairingCode(code);
          
          if (!ws) {
            await channel.send("❌ Invalid pairing code.");
            return;
          }

          // Verify this conversation is assigned to the workspace
          const assignedWorkspaceId = core.services.conversations.getWorkspaceId(platform, externalId);
          if (assignedWorkspaceId !== ws.id) {
            await channel.send("❌ This conversation is not paired to the specified workspace.");
            return;
          }

          // Check if already admin
          const currentRole = core.services.roles.get(ws.id, callerId);
          if (currentRole === "admin") {
            await channel.send("ℹ️ You are already an admin.");
            return;
          }

          // Grant admin role to the caller
          core.services.roles.set(ws.id, callerId, "admin", "pair");
          core.services.workspaces.regeneratePairingCode(ws.id);
          
          await channel.send(`✅ You are now an admin of workspace "${ws.name}".`);
          log.info("User granted admin role via /pair", {
            callerId,
            workspace: ws.name,
            platform,
            externalId,
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
