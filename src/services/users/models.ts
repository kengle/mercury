import { z } from "zod";

export const UserEntity = z.object({
  id: z.string(),
  platform: z.string(),
  displayName: z.string().nullable(),
  firstSeenAt: z.number(),
  lastSeenAt: z.number(),
});
export type UserEntity = z.infer<typeof UserEntity>;

export const CreateUser = z.object({
  id: z.string().min(1),
  platform: z.string().min(1),
  displayName: z.string().optional(),
});
export type CreateUser = z.infer<typeof CreateUser>;

export const UpdateUser = z.object({
  displayName: z.string().nullable().optional(),
});
export type UpdateUser = z.infer<typeof UpdateUser>;

export const DeleteUser = z.object({
  id: z.string().min(1),
});
export type DeleteUser = z.infer<typeof DeleteUser>;
