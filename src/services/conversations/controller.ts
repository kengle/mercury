import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx } from "../../core/api-types.js";

export const conversations = new Hono<Env>();

conversations.get("/", (c) => {
  const { services } = getApiCtx(c);
  return c.json({ conversations: services.conversations.list() });
});

conversations.get("/pairing-code", (c) => {
  const { services } = getApiCtx(c);
  const list = services.workspaces.list();
  const codes = list.map((ws) => ({
    workspace: ws.name,
    code: services.workspaces.getPairingCode(ws.id),
  }));
  return c.json({ codes });
});

conversations.post("/:id/unpair", (c) => {
  const denied = checkPerm(c, "conversations.unpair");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const convId = Number(c.req.param("id"));
  if (!Number.isFinite(convId) || convId < 1)
    return c.json({ error: "Invalid conversation ID" }, 400);

  const all = services.conversations.list();
  const conv = all.find((co) => co.id === convId);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const ok = services.conversations.unassignWorkspace(
    conv.platform,
    conv.externalId,
  );
  if (!ok)
    return c.json({ error: "Conversation not assigned to any workspace" }, 400);
  return c.json({ id: convId, unpaired: true });
});

conversations.put("/:id/workspace", async (c) => {
  const denied = checkPerm(c, "conversations.unpair");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const convId = Number(c.req.param("id"));
  if (!Number.isFinite(convId) || convId < 1)
    return c.json({ error: "Invalid conversation ID" }, 400);

  const body = await c.req.json();
  const workspaceName = body.workspace;
  if (!workspaceName || typeof workspaceName !== "string")
    return c.json({ error: "Missing 'workspace' field" }, 400);

  const ws = services.workspaces.get(workspaceName);
  if (!ws)
    return c.json({ error: `Workspace "${workspaceName}" not found` }, 404);

  const all = services.conversations.list();
  const conv = all.find((co) => co.id === convId);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  services.conversations.assignWorkspace(conv.platform, conv.externalId, ws.id);
  return c.json({ id: convId, workspaceId: ws.id, workspaceName: ws.name });
});

conversations.delete("/:id/workspace", (c) => {
  const denied = checkPerm(c, "conversations.unpair");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const convId = Number(c.req.param("id"));
  if (!Number.isFinite(convId) || convId < 1)
    return c.json({ error: "Invalid conversation ID" }, 400);

  const all = services.conversations.list();
  const conv = all.find((co) => co.id === convId);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  services.conversations.unassignWorkspace(conv.platform, conv.externalId);
  return c.json({ id: convId, unassigned: true });
});
