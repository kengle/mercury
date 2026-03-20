import { Hono } from "hono";
import type { ApiContext, AuthContext, Env } from "./api-types.js";

import { conversations } from "../services/conversations/controller.js";
import { tasks } from "../services/tasks/controller.js";
import { roles, permissions } from "../services/roles/controller.js";
import { config } from "../services/config/controller.js";
import { mutes } from "../services/mutes/controller.js";
import { users } from "../services/users/controller.js";
import { createControlController } from "../services/control/controller.js";
import { createControlService } from "../services/control/service.js";

export function createApiApp(apiCtx: ApiContext): Hono<Env> {
  const app = new Hono<Env>();

  app.use("*", async (c, next) => {
    const callerId = c.req.header("x-mercury-caller");
    if (!callerId) {
      return c.json({ error: "Missing X-Mercury-Caller header" }, 400);
    }

    const role = apiCtx.services.roles.resolveRole(callerId);

    c.set("auth", { callerId, role } as AuthContext);
    c.set("apiCtx", apiCtx);
    await next();
  });

  const controlService = createControlService(
    apiCtx.appConfig,
    apiCtx.agent,
    apiCtx.queue,
    apiCtx.services.roles,
    apiCtx.services.messages,
  );

  app.route("/tasks", tasks);
  app.route("/config", config);
  app.route("/roles", roles);
  app.route("/permissions", permissions);
  app.route("/conversations", conversations);
  app.route("/mutes", mutes);
  app.route("/users", users);
  app.route("/", createControlController(controlService));

  app.all("*", (c) => {
    return c.json({ error: "Not found" }, 404);
  });

  return app;
}

export type { ApiContext, AuthContext, Env } from "./api-types.js";
