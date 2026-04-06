/**
 * Chat SDK adapter setup.
 *
 * Creates Chat SDK adapters for Discord, Slack, Teams, and WeCom.
 * Used by deployments that use Chat SDK directly.
 */

import { createDiscordAdapter } from "@chat-adapter/discord";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createTeamsAdapter } from "@chat-adapter/teams";
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

  if (config.enableSlack) {
    const botToken = process.env.MERCURY_SLACK_BOT_TOKEN;
    const signingSecret = process.env.MERCURY_SLACK_SIGNING_SECRET;
    if (!botToken || !signingSecret) {
      throw new Error(
        "MERCURY_ENABLE_SLACK=true but missing MERCURY_SLACK_BOT_TOKEN or MERCURY_SLACK_SIGNING_SECRET",
      );
    }
    adapters.slack = createSlackAdapter({
      botToken,
      signingSecret,
    });
    log.info("Slack adapter configured");
  }

  if (config.enableTeams) {
    const appId = process.env.MERCURY_TEAMS_APP_ID;
    const appPassword = process.env.MERCURY_TEAMS_APP_PASSWORD;
    if (!appId || !appPassword) {
      throw new Error(
        "MERCURY_ENABLE_TEAMS=true but missing MERCURY_TEAMS_APP_ID or MERCURY_TEAMS_APP_PASSWORD",
      );
    }
    adapters.teams = createTeamsAdapter({
      appId,
      appPassword,
    });
    log.info("Teams adapter configured");
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
      workspaceDir: config.workspacesDir,
      log,
    });
    log.info("WeCom adapter configured", { workspaceDir: config.workspacesDir });
  }

  if (Object.keys(adapters).length === 0) {
    throw new Error(
      "No adapters enabled. Set MERCURY_ENABLE_DISCORD, MERCURY_ENABLE_SLACK, MERCURY_ENABLE_TEAMS, or MERCURY_ENABLE_WECOM to true",
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
  if (threadId.startsWith("discord:")) return "discord";
  if (threadId.startsWith("slack:")) return "slack";
  if (threadId.startsWith("teams:")) return "teams";
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
