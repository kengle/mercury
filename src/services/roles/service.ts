import type { Database } from "bun:sqlite";
import type { ConfigService } from "../config/interface.js";
import type { RoleService } from "./interface.js";
import type { RoleEntity } from "./models.js";

const BUILT_IN_PERMISSIONS = new Set([
  "prompt.group",
  "prompt.dm",
  "stop",
  "compact",
  "tasks.list",
  "tasks.create",
  "tasks.pause",
  "tasks.resume",
  "tasks.delete",
  "config.get",
  "config.set",
  "roles.list",
  "roles.grant",
  "roles.revoke",
  "permissions.get",
  "permissions.set",
  "conversations.unpair",
]);

const SYSTEM_CALLERS = new Set(["system"]);
const DEFAULT_MEMBER_PERMISSIONS = new Set(["prompt.group"]);

export function createRoleService(
  db: Database,
  config: ConfigService,
): RoleService {
  const registeredPermissions = new Map<string, { defaultRoles: string[] }>();

  const insertMember = db.prepare<void, [number, string, number, number]>(
    `INSERT OR IGNORE INTO roles(workspace_id, user_id, role, granted_by, created_at, updated_at)
     VALUES (?, ?, 'member', NULL, ?, ?)`,
  );
  const upsertRole = db.prepare<
    void,
    [number, string, string, string, number, number]
  >(
    `INSERT INTO roles(workspace_id, user_id, role, granted_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, user_id)
     DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, updated_at = excluded.updated_at`,
  );
  const selectRole = db.prepare<{ role: string }, [number, string]>(
    "SELECT role FROM roles WHERE workspace_id = ? AND user_id = ?",
  );
  const selectAll = db.prepare<RoleEntity, [number]>(
    `SELECT user_id as userId, role, granted_by as grantedBy,
            created_at as createdAt, updated_at as updatedAt
     FROM roles WHERE workspace_id = ? ORDER BY created_at ASC`,
  );
  const deleteById = db.prepare<void, [number, string]>(
    "DELETE FROM roles WHERE workspace_id = ? AND user_id = ?",
  );

  function getAllPerms(): string[] {
    return [...BUILT_IN_PERMISSIONS, ...registeredPermissions.keys()];
  }

  function isValid(name: string): boolean {
    return BUILT_IN_PERMISSIONS.has(name) || registeredPermissions.has(name);
  }

  function getDefaultPermissions(role: string): Set<string> {
    if (role === "admin" || role === "system") {
      return new Set(getAllPerms());
    }
    const perms = new Set<string>(
      role === "member" ? DEFAULT_MEMBER_PERMISSIONS : [],
    );
    for (const [name, opts] of registeredPermissions) {
      if (opts.defaultRoles.includes(role)) perms.add(name);
    }
    return perms;
  }

  return {
    get(workspaceId, userId) {
      return selectRole.get(workspaceId, userId)?.role ?? undefined;
    },
    list(workspaceId) {
      return selectAll.all(workspaceId);
    },
    set(workspaceId, userId, role, grantedBy) {
      const now = Date.now();
      upsertRole.run(workspaceId, userId, role, grantedBy, now, now);
    },
    delete(workspaceId, userId) {
      return deleteById.run(workspaceId, userId).changes > 0;
    },
    upsertMember(workspaceId, userId) {
      const now = Date.now();
      insertMember.run(workspaceId, userId, now, now);
    },
    resolveRole(workspaceId, userId) {
      if (SYSTEM_CALLERS.has(userId)) return "system";
      this.upsertMember(workspaceId, userId);
      return this.get(workspaceId, userId) ?? "member";
    },
    hasPermission(role, permission) {
      return this.getRolePermissions(role).has(permission);
    },
    getRolePermissions(role) {
      if (role === "system") return getDefaultPermissions("system");
      const key = `role.${role}.permissions`;
      const stored = config.get(0, key);
      if (stored !== null) {
        const perms = stored
          .split(",")
          .map((s) => s.trim())
          .filter((s) => isValid(s));
        return new Set(perms);
      }
      return getDefaultPermissions(role);
    },
    getAllPermissions: getAllPerms,
    isValidPermission: isValid,
    registerPermission(name, opts) {
      if (BUILT_IN_PERMISSIONS.has(name)) {
        throw new Error(
          `Permission "${name}" is a built-in and cannot be overridden`,
        );
      }
      registeredPermissions.set(name, opts);
    },
    resetPermissions() {
      registeredPermissions.clear();
    },
  };
}
