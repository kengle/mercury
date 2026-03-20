import type { Database } from "bun:sqlite";
import type { ConfigEntity } from "./models.js";
import type { ConfigService } from "./interface.js";
import type { ConfigRegistry } from "./registry.js";

const BUILTIN_KEYS = new Set([
  "trigger.match",
  "trigger.patterns",
  "trigger.case_sensitive",
]);

const BUILTIN_VALIDATORS: Record<string, (v: string) => string | null> = {
  "trigger.match": (v) =>
    ["prefix", "mention", "always"].includes(v) ? null : "Invalid trigger.match. Valid: prefix, mention, always",
  "trigger.case_sensitive": (v) =>
    ["true", "false"].includes(v) ? null : "Invalid trigger.case_sensitive. Valid: true, false",
};

export function createConfigService(db: Database, registry?: ConfigRegistry): ConfigService {
  const selectByKey = db.prepare<{ value: string }, [string]>(
    "SELECT value FROM config WHERE key = ?",
  );
  const selectAll = db.prepare<ConfigEntity, []>(
    `SELECT key, value, updated_by as updatedBy,
            created_at as createdAt, updated_at as updatedAt
     FROM config ORDER BY key ASC`,
  );
  const upsert = db.prepare<void, [string, string, string, number, number]>(
    `INSERT INTO config(key, value, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key)
     DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  );
  const deleteByKey = db.prepare<void, [string]>("DELETE FROM config WHERE key = ?");

  return {
    get(key) {
      return selectByKey.get(key)?.value ?? null;
    },
    list() {
      return selectAll.all();
    },
    set(key, value, updatedBy) {
      const now = Date.now();
      upsert.run(key, value, updatedBy, now, now);
    },
    delete(key) {
      return deleteByKey.run(key).changes > 0;
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
        return registry.validate(key, value) ? null : `Invalid value for ${key}`;
      }
      return "Invalid config key";
    },
  };
}
