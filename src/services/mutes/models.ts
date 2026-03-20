import { z } from "zod";

export const MuteEntity = z.object({
  userId: z.string(),
  expiresAt: z.number(),
  reason: z.string().nullable(),
  mutedBy: z.string(),
  createdAt: z.number(),
});
export type MuteEntity = z.infer<typeof MuteEntity>;

export const CreateMute = z.object({
  userId: z.string().min(1),
  duration: z.string().min(1),
  reason: z.string().optional(),
  confirm: z.boolean().default(false),
});
export type CreateMute = z.infer<typeof CreateMute>;

export const DeleteMute = z.object({
  userId: z.string().min(1),
});
export type DeleteMute = z.infer<typeof DeleteMute>;
