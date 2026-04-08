import type { Chat } from "chat";
import type { ConversationService } from "../../services/conversations/interface.js";
import type { Logger } from "../logger.js";
import type { MessageSender, OutputFile } from "../types.js";

export function createChatSdkSender(
  bot: Chat,
  conversations: ConversationService,
  log: Logger,
): MessageSender {
  return {
    async send(
      text: string,
      conversationId: string,
      _files?: OutputFile[],
    ): Promise<void> {
      if (!conversationId) {
        log.warn("No conversation target for scheduled message");
        return;
      }

      const convos = conversations.list();
      const conv = convos.find((c) => c.externalId === conversationId);
      if (!conv) {
        log.warn("Conversation not found for scheduled message", {
          conversationId,
        });
        return;
      }

      const threadId = toThreadId(conv.platform, conv.externalId);

      try {
        const channel = bot.channel(threadId);
        await channel.post(text);
        log.debug("Scheduled message sent", {
          platform: conv.platform,
          conversationId: conv.externalId,
        });
      } catch (err) {
        log.error("Failed to send scheduled message", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

function toThreadId(platform: string, externalId: string): string {
  switch (platform) {
    case "discord":
      return `discord:${externalId}`;
    case "slack":
      return `slack:${externalId}`;
    case "teams":
      return `teams:${externalId}`;
    case "wecom":
      // WeCom threadId format: wecom:{convId}:{chattype}:{reqId}
      // For scheduled messages, use "single" chattype and sched- prefixed reqId
      return `wecom:${externalId}:single:sched-${Date.now()}`;
    default:
      return externalId;
  }
}
