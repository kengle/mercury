import { z } from "zod";

export const RoleEntity = z.object({
  userId: z.string(),
  role: z.string(),
  grantedBy: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type RoleEntity = z.infer<typeof RoleEntity>;

export const CreateRole = z.object({
  userId: z.string().min(1),
  role: z.string().default("member"),
});
export type CreateRole = z.infer<typeof CreateRole>;

export const UpdateRole = z.object({
  userId: z.string().min(1),
  role: z.string().min(1),
});
export type UpdateRole = z.infer<typeof UpdateRole>;

export const DeleteRole = z.object({
  userId: z.string().min(1),
});
export type DeleteRole = z.infer<typeof DeleteRole>;

export const SetPermissions = z.object({
  role: z.string().min(1),
  permissions: z.array(z.string()),
});
export type SetPermissions = z.infer<typeof SetPermissions>;
