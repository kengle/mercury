import { Hono } from "hono";
import { checkPerm, type Env, getAuth } from "../../core/api-types.js";
import type { ControlService } from "./interface.js";

export function createControlController(control: ControlService): Hono<Env> {
  const app = new Hono<Env>();

  app.get("/whoami", (c) => {
    const { callerId, role } = getAuth(c);
    return c.json(control.whoami(callerId, role));
  });

  app.post("/stop", (c) => {
    const denied = checkPerm(c, "stop");
    if (denied) return denied;
    return c.json(control.stop());
  });

  app.post("/compact", async (c) => {
    const denied = checkPerm(c, "compact");
    if (denied) return denied;
    const conversationId = c.req.query("conversation") || "default";
    return c.json(await control.compact(conversationId));
  });

  app.post("/new", (c) => {
    const denied = checkPerm(c, "compact");
    if (denied) return denied;
    const conversationId = c.req.query("conversation") || "default";
    return c.json(control.newSession(conversationId));
  });

  return app;
}
