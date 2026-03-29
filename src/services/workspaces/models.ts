import { z } from "zod";

export const WorkspaceEntity = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type WorkspaceEntity = z.infer<typeof WorkspaceEntity>;

export const CreateWorkspace = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
      message:
        "Workspace name must be lowercase alphanumeric with hyphens, not starting/ending with hyphen",
    }),
});
export type CreateWorkspace = z.infer<typeof CreateWorkspace>;
