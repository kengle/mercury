/**
 * Chat SDK adapter setup.
 *
 * Creates Chat SDK adapters for WhatsApp (Baileys), Discord, and WeCom.
 * Used by deployments that use Chat SDK directly.
 */

import { createDiscordAdapter } from "@chat-adapter/discord";
import { useMultiFileAuthState } from "baileys";
import { createBaileysAdapter } from "chat-adapter-baileys";
import type { AppConfig } from "../config.js";
import { resolveProjectPath } from "../config.js";
import type { Logger } from "../logger.js";
import { createWeComAdapter } from "../../adapters/wecom.js";

export interface ChatSdkAdapters {
  [name: string]: any;
}

export async function setupChatSdkAdapters(
  config: AppConfig,
  log: Logger,
): Promise<ChatSdkAdapters> {
  const adapters: ChatSdkAdapters = {};

  if (config.enableWhatsApp) {
    const authDir = resolveProjectPath(config.whatsappAuthDir);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    adapters.whatsapp = createBaileysAdapter({
      auth: { state, saveCreds },
      userName: config.botUsername,
      onQR: async (qr) => {
        const QRCode = await import("qrcode-terminal");
        QRCode.default.generate(qr, { small: true });
      },
    });
    log.info("WhatsApp adapter configured", { authDir });
  }

  if (config.enableDiscord) {
    const token = process.env.MERCURY_DISCORD_BOT_TOKEN;
    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    const appId = process.env.DISCORD_APPLICATION_ID;
    if (!token) {
      throw new Error(
        "MERCURY_ENABLE_DISCORD=true but MERCURY_DISCORD_BOT_TOKEN is not set",
      );
    }
    if (!publicKey || !appId) {
      throw new Error(
        "Discord enabled but missing DISCORD_PUBLIC_KEY or DISCORD_APPLICATION_ID",
      );
    }
    adapters.discord = createDiscordAdapter({
      botToken: token,
      publicKey,
      applicationId: appId,
    });
    log.info("Discord adapter configured");
  }

  if (config.enableWeCom) {
    const botId = process.env.MERCURY_WECOM_BOT_ID;
    const secret = process.env.MERCURY_WECOM_SECRET;
    if (!botId || !secret) {
      throw new Error(
        "MERCURY_ENABLE_WECOM=true but missing MERCURY_WECOM_BOT_ID or MERCURY_WECOM_SECRET",
      );
    }
    adapters.wecom = createWeComAdapter({
      botId,
      secret,
      mediaDir: config.wecomMediaDir,
      log,
    });
    log.info("WeCom adapter configured", { mediaDir: config.wecomMediaDir });
  }

  if (Object.keys(adapters).length === 0) {
    throw new Error(
      "No adapters enabled. Set MERCURY_ENABLE_WHATSAPP, MERCURY_ENABLE_DISCORD, or MERCURY_ENABLE_WECOM to true",
    );
  }

  return adapters;
}

/**
 * Connect persistent adapters (WebSocket-based).
 */
export async function connectAdapters(
  adapters: ChatSdkAdapters,
  log: Logger,
): Promise<void> {
  if (adapters.whatsapp) {
    await adapters.whatsapp.connect();
    log.info("WhatsApp connected");
  }

  if (adapters.discord) {
    adapters.discord
      .startGatewayListener(
        { waitUntil: (p: Promise<any>) => p },
        2_147_483_647,
      )
      .catch((err: Error) =>
        log.error("Discord gateway error", { error: err.message }),
      );
    log.info("Discord gateway started");
  }

  // WeCom adapter is initialized by Chat SDK's bot.initialize()
  // No need to call initialize() here
  if (adapters.wecom) {
    log.info("WeCom adapter loaded (will be initialized by Chat SDK)");
  }
}

/**
 * Disconnect all adapters gracefully.
 */
export async function disconnectAdapters(
  adapters: ChatSdkAdapters,
  log: Logger,
): Promise<void> {
  for (const [name, adapter] of Object.entries(adapters)) {
    try {
      if ("shutdown" in adapter && typeof adapter.shutdown === "function") {
        await adapter.shutdown();
        log.info("Adapter disconnected", { adapter: name });
      }
    } catch (err) {
      log.error("Failed to disconnect adapter", {
        adapter: name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Resolve platform name from Chat SDK thread ID prefix.
 */
export function getPlatformFromThreadId(threadId: string): string {
  if (threadId.startsWith("baileys:")) return "whatsapp";
  if (threadId.startsWith("discord:")) return "discord";
  if (threadId.startsWith("slack:")) return "slack";
  if (threadId.startsWith("wecom:")) return "wecom";
  return "unknown";
}

/**
 * Build a caller ID from platform + Chat SDK author.
 */
export function getCallerId(platform: string, author: any): string {
  const id = author.userId || author.id || author.userName;
  return `${platform}:${id}`;
}
