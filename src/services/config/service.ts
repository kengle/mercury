import type { Database } from "bun:sqlite";
import type { ConfigService } from "./interface.js";
import type { ConfigEntity } from "./models.js";
import type { ConfigRegistry } from "./registry.js";

const BUILTIN_KEYS = new Set([
  "trigger.match",
  "trigger.patterns",
  "trigger.case_sensitive",
]);

const BUILTIN_VALIDATORS: Record<string, (v: string) => string | null> = {
  "trigger.match": (v) =>
    ["prefix", "mention", "always"].includes(v)
      ? null
      : "Invalid trigger.match. Valid: prefix, mention, always",
  "trigger.case_sensitive": (v) =>
    ["true", "false"].includes(v)
      ? null
      : "Invalid trigger.case_sensitive. Valid: true, false",
};

export function createConfigService(
  db: Database,
  registry?: ConfigRegistry,
): ConfigService {
  const selectByKey = db.prepare<{ value: string }, [number, string]>(
    "SELECT value FROM config WHERE workspace_id = ? AND key = ?",
  );
  const selectAll = db.prepare<ConfigEntity, [number]>(
    `SELECT key, value, updated_by as updatedBy,
            created_at as createdAt, updated_at as updatedAt
     FROM config WHERE workspace_id = ? ORDER BY key ASC`,
  );
  const upsert = db.prepare<
    void,
    [number, string, string, string, number, number]
  >(
    `INSERT INTO config(workspace_id, key, value, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, key)
     DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  );
  const deleteByKey = db.prepare<void, [number, string]>(
    "DELETE FROM config WHERE workspace_id = ? AND key = ?",
  );

  return {
    get(workspaceId, key) {
      return selectByKey.get(workspaceId, key)?.value ?? null;
    },
    list(workspaceId) {
      return selectAll.all(workspaceId);
    },
    set(workspaceId, key, value, updatedBy) {
      const now = Date.now();
      upsert.run(workspaceId, key, value, updatedBy, now, now);
    },
    delete(workspaceId, key) {
      return deleteByKey.run(workspaceId, key).changes > 0;
    },
    isValidKey(key) {
      return BUILTIN_KEYS.has(key) || (registry?.isValidKey(key) ?? false);
    },
    validate(key, value) {
      if (BUILTIN_KEYS.has(key)) {
        const validator = BUILTIN_VALIDATORS[key];
        if (validator) return validator(value);
        return null;
      }
      if (registry?.isValidKey(key)) {
        return registry.validate(key, value)
          ? null
          : `Invalid value for ${key}`;
      }
      return "Invalid config key";
    },
  };
}
