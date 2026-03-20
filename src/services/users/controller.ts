import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx } from "../../core/api-types.js";

export const users = new Hono<Env>();

users.get("/", (c) => {
  const denied = checkPerm(c, "roles.list");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  return c.json({ users: services.users.list() });
});

users.get("/:id", (c) => {
  const denied = checkPerm(c, "roles.list");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const id = decodeURIComponent(c.req.param("id"));
  const user = services.users.get(id);
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});
