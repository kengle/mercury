import { Hono } from "hono";
import { type Env, getApiCtx } from "../../core/api-types.js";
import { CreateWorkspace } from "./models.js";

export const workspaces = new Hono<Env>();

workspaces.get("/", (c) => {
  const { services } = getApiCtx(c);
  const list = services.workspaces.list().map((ws) => ({
    ...ws,
    conversationCount: services.workspaces.getConversationCount(ws.id),
    pairingCode: services.workspaces.getPairingCode(ws.id),
  }));
  return c.json({ workspaces: list });
});

workspaces.post("/", async (c) => {
  const { services } = getApiCtx(c);
  const body = await c.req.json();
  const parsed = CreateWorkspace.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      400,
    );
  try {
    const ws = services.workspaces.create(parsed.data.name);
    return c.json(ws, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      409,
    );
  }
});

workspaces.delete("/:name", (c) => {
  const { services } = getApiCtx(c);
  const name = c.req.param("name");
  try {
    const ok = services.workspaces.delete(name);
    if (!ok) return c.json({ error: "Workspace not found" }, 404);
    return c.json({ deleted: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      409,
    );
  }
});

workspaces.get("/:name/conversations", (c) => {
  const { services } = getApiCtx(c);
  const name = c.req.param("name");
  const ws = services.workspaces.get(name);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const all = services.conversations
    .list()
    .filter((conv) => conv.workspaceId === ws.id);
  return c.json({ conversations: all });
});

workspaces.get("/:name/pairing-code", (c) => {
  const { services } = getApiCtx(c);
  const name = c.req.param("name");
  const ws = services.workspaces.get(name);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  return c.json({ code: services.workspaces.getPairingCode(ws.id) });
});
