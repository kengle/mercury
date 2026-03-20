import { Hono } from "hono";
import type { ChatService } from "./interface.js";
import { ChatRequest } from "./models.js";

export function createChatController(chatService: ChatService): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = ChatRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Missing or empty 'text' field" }, 400);

    try {
      const result = await chatService.send(body.data);
      return c.json(result);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 403);
    }
  });

  return app;
}
