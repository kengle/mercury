import { Hono } from "hono";
import {
  checkPerm,
  type Env,
  getApiCtx,
  getAuth,
} from "../../core/api-types.js";
import { UpdateConfig } from "./models.js";

export const config = new Hono<Env>();

config.get("/", (c) => {
  const denied = checkPerm(c, "config.get");
  if (denied) return denied;

  const { services, configRegistry } = getApiCtx(c);
  const { workspaceId } = getAuth(c);
  const entries = services.config.list(workspaceId);
  const configMap: Record<string, string> = {};
  for (const e of entries) configMap[e.key] = e.value;

  const available = configRegistry.getAll().map((rc) => ({
    key: rc.key,
    description: rc.description,
    default: rc.default,
  }));

  return c.json({ config: configMap, available });
});

config.put("/", async (c) => {
  const { callerId } = getAuth(c);
  const denied = checkPerm(c, "config.set");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const body = UpdateConfig.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const { key, value } = body.data;
  if (!services.config.isValidKey(key))
    return c.json({ error: "Invalid config key" }, 400);

  const error = services.config.validate(key, value);
  if (error) return c.json({ error }, 400);

  const { workspaceId } = getAuth(c);
  services.config.set(workspaceId, key, value, callerId);
  return c.json({ key, value });
});
