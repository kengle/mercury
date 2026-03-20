import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx } from "../../core/api-types.js";

export const conversations = new Hono<Env>();

conversations.get("/", (c) => {
  const { services } = getApiCtx(c);
  return c.json({ conversations: services.conversations.list() });
});

conversations.get("/pairing-code", (c) => {
  const { services } = getApiCtx(c);
  return c.json({ code: services.conversations.getPairingCode() });
});

conversations.post("/:id/unpair", (c) => {
  const denied = checkPerm(c, "conversations.unpair");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const convId = Number(c.req.param("id"));
  if (!Number.isFinite(convId) || convId < 1) return c.json({ error: "Invalid conversation ID" }, 400);

  const all = services.conversations.list();
  const conv = all.find((co) => co.id === convId);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const ok = services.conversations.unpair(conv.platform, conv.externalId);
  if (!ok) return c.json({ error: "Conversation not paired" }, 400);
  return c.json({ id: convId, unpaired: true });
});
