import { Hono } from "hono";
import { config } from "../services/config/controller.js";
import { createControlController } from "../services/control/controller.js";
import { createControlService } from "../services/control/service.js";
import { conversations } from "../services/conversations/controller.js";
import { mutes } from "../services/mutes/controller.js";
import { permissions, roles } from "../services/roles/controller.js";
import { tasks } from "../services/tasks/controller.js";
import { users } from "../services/users/controller.js";
import { workspaces } from "../services/workspaces/controller.js";
import type { ApiContext, AuthContext, Env } from "./api-types.js";

export function createApiApp(apiCtx: ApiContext): Hono<Env> {
  const app = new Hono<Env>();

  app.use("*", async (c, next) => {
    const callerId = c.req.header("x-mercury-caller");
    if (!callerId) {
      return c.json({ error: "Missing X-Mercury-Caller header" }, 400);
    }

    const workspaceIdStr = c.req.header("x-mercury-workspace");
    const workspaceId = workspaceIdStr
      ? Number.parseInt(workspaceIdStr, 10)
      : 0;
    const role = apiCtx.services.roles.resolveRole(workspaceId, callerId);
    const ws = workspaceId
      ? apiCtx.services.workspaces.getById(workspaceId)
      : null;

    c.set("auth", {
      callerId,
      role,
      workspaceId,
      workspaceName: ws?.name ?? "",
    } as AuthContext);
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

  app.route("/workspaces", workspaces);
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
