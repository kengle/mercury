import path from "node:path";
import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx, getAuth } from "../api-types.js";
import { compactSession } from "../compact.js";
import { getRolePermissions } from "../permissions.js";

export const control = new Hono<Env>();

control.get("/whoami", (c) => {
  const { callerId, spaceId, role } = getAuth(c);
  const { db } = getApiCtx(c);
  const permissions = [...getRolePermissions(db, spaceId, role)];
  return c.json({ callerId, spaceId, role, permissions });
});

control.post("/stop", (c) => {
  const { spaceId } = getAuth(c);
  const denied = checkPerm(c, "stop");
  if (denied) return denied;

  const { containerRunner, queue } = getApiCtx(c);
  const stopped = containerRunner.abort(spaceId);
  const dropped = queue.cancelPending(spaceId);

  return c.json({ stopped, dropped });
});

control.post("/compact", async (c) => {
  const { spaceId } = getAuth(c);
  const denied = checkPerm(c, "compact");
  if (denied) return denied;

  const { config, db } = getApiCtx(c);
  const safeSpace = spaceId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const workspace = path.resolve(config.spacesDir, safeSpace);
  const sessionFile = path.join(workspace, ".mercury.session.jsonl");

  const result = await compactSession(sessionFile, config);

  // Also set Mercury's own message boundary
  const boundary = db.setSessionBoundaryToLatest(spaceId);

  return c.json({ spaceId, boundary, compaction: result });
});
