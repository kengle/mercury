import { z } from "zod";

export const TaskEntity = z.object({
  id: z.number(),
  cron: z.string().nullable(),
  at: z.string().nullable(),
  prompt: z.string(),
  active: z.boolean(),
  silent: z.boolean(),
  nextRunAt: z.number(),
  createdBy: z.string(),
  conversationId: z.string(),
  workspaceId: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type TaskEntity = z.infer<typeof TaskEntity>;

export const CreateTask = z.object({
  cron: z.string().optional(),
  at: z.string().optional(),
  prompt: z.string().min(1),
  silent: z.boolean().default(false),
  createdBy: z.string().optional(),
  conversationId: z.string().optional(),
});
export type CreateTask = z.infer<typeof CreateTask>;

export const UpdateTask = z.object({
  active: z.boolean().optional(),
  nextRunAt: z.number().optional(),
});
export type UpdateTask = z.infer<typeof UpdateTask>;

export const DeleteTask = z.object({
  id: z.number(),
});
export type DeleteTask = z.infer<typeof DeleteTask>;
