import { Hono } from "hono";
import type { Env } from "../../core/api-types.js";
import type { ExtensionListService } from "./interface.js";

export function createExtensionController(extensionService: ExtensionListService): Hono<Env> {
  const app = new Hono<Env>();

  app.get("/", (c) => {
    return c.json({ extensions: extensionService.list() });
  });

  return app;
}
