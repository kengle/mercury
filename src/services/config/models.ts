import { z } from "zod";

export const ConfigEntity = z.object({
  key: z.string(),
  value: z.string(),
  updatedBy: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ConfigEntity = z.infer<typeof ConfigEntity>;

export const CreateConfig = z.object({
  key: z.string().min(1),
  value: z.string(),
});
export type CreateConfig = z.infer<typeof CreateConfig>;

export const UpdateConfig = z.object({
  key: z.string().min(1),
  value: z.string(),
});
export type UpdateConfig = z.infer<typeof UpdateConfig>;

export const DeleteConfig = z.object({
  key: z.string().min(1),
});
export type DeleteConfig = z.infer<typeof DeleteConfig>;
