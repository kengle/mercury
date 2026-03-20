import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx, getAuth } from "../../core/api-types.js";
import { CreateMute } from "./models.js";

export const mutes = new Hono<Env>();

mutes.get("/", (c) => {
  const denied = checkPerm(c, "roles.list");
  if (denied) return denied;
  const { services } = getApiCtx(c);
  return c.json({ mutes: services.mutes.list() });
});

mutes.post("/", async (c) => {
  const { callerId } = getAuth(c);
  const denied = checkPerm(c, "roles.grant");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const body = CreateMute.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  try {
    const result = services.mutes.create(body.data, callerId);
    if ("warning" in result) return c.json({ warning: true, message: result.warning });
    return c.json({ muted: true, ...result });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

mutes.delete("/:userId", (c) => {
  const denied = checkPerm(c, "roles.grant");
  if (denied) return denied;
  const { services } = getApiCtx(c);
  const userId = decodeURIComponent(c.req.param("userId"));
  const removed = services.mutes.delete(userId);
  if (!removed) return c.json({ error: "User not muted" }, 404);
  return c.json({ unmuted: true, userId });
});
