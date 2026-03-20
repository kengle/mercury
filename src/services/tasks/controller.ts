import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx, getAuth } from "../../core/api-types.js";
import { CreateTask } from "./models.js";

export const tasks = new Hono<Env>();

tasks.get("/", (c) => {
  const denied = checkPerm(c, "tasks.list");
  if (denied) return denied;
  const { services } = getApiCtx(c);
  return c.json({ tasks: services.tasks.list() });
});

tasks.post("/", async (c) => {
  const { callerId } = getAuth(c);
  const denied = checkPerm(c, "tasks.create");
  if (denied) return denied;

  const { services } = getApiCtx(c);
  const body = CreateTask.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const conversationId = c.req.header("x-mercury-conversation") ?? "";
  try {
    const result = services.tasks.create({ ...body.data, createdBy: callerId, conversationId });
    return c.json({ ...body.data, ...result, createdBy: callerId, conversationId });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

tasks.post("/:id/pause", (c) => {
  const denied = checkPerm(c, "tasks.pause");
  if (denied) return denied;
  const { services } = getApiCtx(c);
  const taskId = Number(c.req.param("id"));
  if (!Number.isFinite(taskId) || taskId < 1) return c.json({ error: "Invalid task ID" }, 400);
  try {
    const task = services.tasks.pause(taskId);
    return c.json({ id: task.id, active: task.active });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 404);
  }
});

tasks.post("/:id/resume", (c) => {
  const denied = checkPerm(c, "tasks.resume");
  if (denied) return denied;
  const { services } = getApiCtx(c);
  const taskId = Number(c.req.param("id"));
  if (!Number.isFinite(taskId) || taskId < 1) return c.json({ error: "Invalid task ID" }, 400);
  try {
    const task = services.tasks.resume(taskId);
    return c.json({ id: task.id, active: task.active });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 404);
  }
});

tasks.post("/:id/run", (c) => {
  const denied = checkPerm(c, "tasks.create");
  if (denied) return denied;
  const { services } = getApiCtx(c);
  const taskId = Number(c.req.param("id"));
  if (!Number.isFinite(taskId) || taskId < 1) return c.json({ error: "Invalid task ID" }, 400);

  const task = services.tasks.get(taskId);
  if (!task) return c.json({ error: "Task not found" }, 404);
  if (!task.active) return c.json({ error: "Task is paused" }, 400);

  services.tasks.triggerTask(taskId).catch(() => {});
  return c.json({ id: taskId, triggered: true });
});

tasks.delete("/:id", (c) => {
  const denied = checkPerm(c, "tasks.delete");
  if (denied) return denied;
  const { services } = getApiCtx(c);
  const taskId = Number(c.req.param("id"));
  if (!Number.isFinite(taskId) || taskId < 1) return c.json({ error: "Invalid task ID" }, 400);
  const deleted = services.tasks.delete(taskId);
  if (!deleted) return c.json({ error: "Task not found" }, 404);
  return c.json({ id: taskId, deleted: true });
});
