import type { RoleEntity } from "./models.js";

export interface RoleService {
  get(workspaceId: number, userId: string): string | undefined;
  list(workspaceId: number): RoleEntity[];
  set(
    workspaceId: number,
    userId: string,
    role: string,
    grantedBy: string,
  ): void;
  delete(workspaceId: number, userId: string): boolean;
  upsertMember(workspaceId: number, userId: string): void;
  resolveRole(workspaceId: number, userId: string): string;
  hasPermission(role: string, permission: string): boolean;
  getRolePermissions(role: string): Set<string>;
  getAllPermissions(): string[];
  isValidPermission(name: string): boolean;
  registerPermission(name: string, opts: { defaultRoles: string[] }): void;
  resetPermissions(): void;
}
