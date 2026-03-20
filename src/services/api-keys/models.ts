import { z } from "zod";

export const ApiKeyEntity = z.object({
  id: z.number(),
  name: z.string(),
  keyHash: z.string(),
  keyPrefix: z.string(),
  createdAt: z.number(),
  revokedAt: z.number().nullable(),
});
export type ApiKeyEntity = z.infer<typeof ApiKeyEntity>;

export const CreateApiKey = z.object({
  name: z.string().min(1).max(100),
});
export type CreateApiKey = z.infer<typeof CreateApiKey>;
