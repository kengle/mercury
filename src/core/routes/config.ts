import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx, getAuth } from "../api-types.js";

/** Built-in config keys that are always valid. */
const BUILTIN_KEYS = new Set([
  "trigger.match",
  "trigger.patterns",
  "trigger.case_sensitive",
]);

/** Built-in validators for specific keys. */
const BUILTIN_VALIDATORS: Record<string, (v: string) => string | null> = {
  "trigger.match": (v) =>
    ["prefix", "mention", "always"].includes(v)
      ? null
      : "Invalid trigger.match value. Valid: prefix, mention, always",
  "trigger.case_sensitive": (v) =>
    ["true", "false"].includes(v)
      ? null
      : "Invalid trigger.case_sensitive value. Valid: true, false",
};

export const config = new Hono<Env>();

config.get("/", (c) => {
  const { spaceId } = getAuth(c);
  const denied = checkPerm(c, "config.get");
  if (denied) return denied;

  const { db, configRegistry } = getApiCtx(c);
  const entries = db.listSpaceConfig(spaceId);
  const configMap: Record<string, string> = {};
  for (const e of entries) configMap[e.key] = e.value;

  // Include registered extension config keys with descriptions and defaults
  const available = configRegistry.getAll().map((rc) => ({
    key: rc.key,
    description: rc.description,
    default: rc.default,
  }));

  return c.json({ spaceId, config: configMap, available });
});

config.put("/", async (c) => {
  const { spaceId, callerId } = getAuth(c);
  const denied = checkPerm(c, "config.set");
  if (denied) return denied;

  const { db, configRegistry } = getApiCtx(c);
  const body = await c.req.json<{ key?: string; value?: string }>();

  if (!body.key || body.value === undefined) {
    return c.json({ error: "Missing key or value" }, 400);
  }

  const isBuiltin = BUILTIN_KEYS.has(body.key);
  const isExtension = configRegistry.isValidKey(body.key);

  if (!isBuiltin && !isExtension) {
    return c.json(
      {
        error: `Invalid config key. Run mrctl config get for valid keys.`,
      },
      400,
    );
  }

  // Built-in validation
  if (isBuiltin) {
    const validator = BUILTIN_VALIDATORS[body.key];
    if (validator) {
      const error = validator(body.value);
      if (error) return c.json({ error }, 400);
    }
  }

  // Extension config validation
  if (isExtension && !configRegistry.validate(body.key, body.value)) {
    return c.json({ error: `Invalid value for ${body.key}` }, 400);
  }

  db.setSpaceConfig(spaceId, body.key, body.value, callerId);
  return c.json({ spaceId, key: body.key, value: body.value });
});
