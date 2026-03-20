import type { Database } from "bun:sqlite";
import type { RoleEntity } from "./models.js";
import type { RoleService } from "./interface.js";
import type { ConfigService } from "../config/interface.js";

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

export function createRoleService(db: Database, config: ConfigService): RoleService {
  const registeredPermissions = new Map<string, { defaultRoles: string[] }>();

  const insertMember = db.prepare<void, [string, number, number]>(
    `INSERT OR IGNORE INTO roles(user_id, role, granted_by, created_at, updated_at)
     VALUES (?, 'member', NULL, ?, ?)`,
  );
  const upsertRole = db.prepare<void, [string, string, string, number, number]>(
    `INSERT INTO roles(user_id, role, granted_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id)
     DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, updated_at = excluded.updated_at`,
  );
  const selectRole = db.prepare<{ role: string }, [string]>(
    "SELECT role FROM roles WHERE user_id = ?",
  );
  const selectAll = db.prepare<RoleEntity, []>(
    `SELECT user_id as userId, role, granted_by as grantedBy,
            created_at as createdAt, updated_at as updatedAt
     FROM roles ORDER BY created_at ASC`,
  );
  const deleteById = db.prepare<void, [string]>("DELETE FROM roles WHERE user_id = ?");

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
    get(userId) {
      return selectRole.get(userId)?.role ?? undefined;
    },
    list() {
      return selectAll.all();
    },
    set(userId, role, grantedBy) {
      const now = Date.now();
      upsertRole.run(userId, role, grantedBy, now, now);
    },
    delete(userId) {
      return deleteById.run(userId).changes > 0;
    },
    upsertMember(userId) {
      const now = Date.now();
      insertMember.run(userId, now, now);
    },
    resolveRole(userId) {
      if (SYSTEM_CALLERS.has(userId)) return "system";
      this.upsertMember(userId);
      return this.get(userId) ?? "member";
    },
    hasPermission(role, permission) {
      return this.getRolePermissions(role).has(permission);
    },
    getRolePermissions(role) {
      if (role === "system") return getDefaultPermissions("system");
      const key = `role.${role}.permissions`;
      const stored = config.get(key);
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
        throw new Error(`Permission "${name}" is a built-in and cannot be overridden`);
      }
      registeredPermissions.set(name, opts);
    },
    resetPermissions() {
      registeredPermissions.clear();
    },
  };
}
