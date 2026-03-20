import type { RoleEntity } from "./models.js";

export interface RoleService {
  get(userId: string): string | undefined;
  list(): RoleEntity[];
  set(userId: string, role: string, grantedBy: string): void;
  delete(userId: string): boolean;
  upsertMember(userId: string): void;
  resolveRole(userId: string): string;
  hasPermission(role: string, permission: string): boolean;
  getRolePermissions(role: string): Set<string>;
  getAllPermissions(): string[];
  isValidPermission(name: string): boolean;
  registerPermission(name: string, opts: { defaultRoles: string[] }): void;
  resetPermissions(): void;
}
