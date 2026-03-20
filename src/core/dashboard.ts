import { Hono } from "hono";
import type { MercuryCoreRuntime } from "./runtime/runtime.js";

interface DashboardContext {
  core: MercuryCoreRuntime;
  adapters: Record<string, boolean>;
  startTime: number;
}

export function createDashboardRoutes(ctx: DashboardContext) {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  return app;
}
