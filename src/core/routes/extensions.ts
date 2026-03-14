import { Hono } from "hono";
import { type Env, getApiCtx } from "../api-types.js";

export const extensions = new Hono<Env>();

/** GET /ext — list all installed extensions */
extensions.get("/", (c) => {
  const { registry } = getApiCtx(c);

  const list = registry.list().map((ext) => ({
    name: ext.name,
    hasCli: ext.clis.length > 0,
    hasSkill: !!ext.skillDir,
    permission: ext.permission ? ext.name : null,
  }));

  return c.json({ extensions: list });
});
