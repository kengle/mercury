import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { createApiApp } from "./core/api.js";
import type { AppConfig } from "./core/config.js";
import { createDashboardRoutes } from "./core/dashboard.js";
import { logger } from "./core/logger.js";
import type { MercuryCoreRuntime } from "./core/runtime/runtime.js";
import type { ExtensionRegistry } from "./extensions/loader.js";
import { createChatController } from "./services/chat/controller.js";
import { createChatService } from "./services/chat/service.js";
import type { ConfigRegistry } from "./services/config/registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type WaitUntil = (task: Promise<unknown>) => void;

type WebhookHandler = (
  request: Request,
  options?: { waitUntil?: WaitUntil },
) => Promise<Response>;

import type { ApiKeyService } from "./services/api-keys/interface.js";

export interface ServerContext {
  core: MercuryCoreRuntime;
  config: AppConfig;
  adapters: Record<string, any>;
  webhooks: Record<string, WebhookHandler>;
  startTime: number;
  registry: ExtensionRegistry;
  configRegistry: ConfigRegistry;
  apiKeys: ApiKeyService;
}

export function createApp(ctx: ServerContext): Hono {
  const { core, config, adapters, webhooks, startTime } = ctx;

  const waitUntil: WaitUntil = (task) => {
    void task.catch((error) => {
      logger.error(
        "Background task failed",
        error instanceof Error ? error : undefined,
      );
    });
  };

  const app = new Hono();

  // ─── API Key Auth ───────────────────────────────────────────────────────

  app.use("*", async (c, next) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json(
        { error: "Missing API key. Use Authorization: Bearer <key>" },
        401,
      );
    }
    const key = header.slice(7);
    if (!ctx.apiKeys.validate(key)) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    await next();
  });

  // ─── Dashboard ──────────────────────────────────────────────────────────

  app.get("/", (c) => {
    try {
      const html = readFileSync(
        join(__dirname, "dashboard/index.html"),
        "utf8",
      );
      return c.html(html);
    } catch {
      return c.text("Dashboard not found", 404);
    }
  });

  app.get("/dashboard", (c) => {
    try {
      const html = readFileSync(
        join(__dirname, "dashboard/index.html"),
        "utf8",
      );
      return c.html(html);
    } catch {
      return c.text("Dashboard not found", 404);
    }
  });

  // Dashboard partials (htmx)
  const adapterStatus: Record<string, boolean> = {};
  for (const name of Object.keys(adapters)) {
    adapterStatus[name] = true;
  }

  const dashboardRoutes = createDashboardRoutes({
    core,
    adapters: adapterStatus,
    startTime,
  });

  app.route("/dashboard", dashboardRoutes);

  // ─── Health & Auth ──────────────────────────────────────────────────────

  app.get("/health", (c) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const adapterStatus: Record<string, boolean> = {};
    for (const name of Object.keys(adapters)) {
      adapterStatus[name] = true;
    }
    return c.json({
      status: "ok",
      uptime: uptimeSeconds,
      queue: {
        active: core.queue.isActive,
        pending: core.queue.pendingCount,
      },
      agent: {
        running: core.agent.isRunning,
      },
      adapters: adapterStatus,
    });
  });

  app.get("/auth/whatsapp", (c) => {
    const wa = adapters.whatsapp;
    if (!wa) {
      return c.json({ error: "WhatsApp adapter not enabled" }, 400);
    }
    if (typeof wa.getQrStatus === "function") {
      return c.json(wa.getQrStatus());
    }
    return c.json({ status: "connected" });
  });

  // ─── Internal API ───────────────────────────────────────────────────────

  const apiApp = createApiApp({
    services: core.services,
    appConfig: config,
    agent: core.agent,
    queue: core.queue,
    registry: ctx.registry,
    configRegistry: ctx.configRegistry,
  });

  app.route("/api", apiApp);
  app.route("/chat", createChatController(createChatService(core)));

  // ─── Webhooks ───────────────────────────────────────────────────────────

  app.all("/webhooks/:platform", async (c) => {
    const platform = c.req.param("platform");
    logger.info("Webhook dispatch", { platform });

    const handler = webhooks[platform];
    if (!handler) {
      return c.text(`Unknown platform: ${platform}`, 404);
    }

    return handler(c.req.raw, { waitUntil });
  });

  // ─── Fallback ───────────────────────────────────────────────────────────

  app.all("*", (c) => {
    return c.text("Not found", 404);
  });

  return app;
}
