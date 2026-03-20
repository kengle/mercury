import type { Database } from "bun:sqlite";

export interface ExtensionStateService {
  get(extension: string, key: string): string | null;
  list(extension: string): Array<{ key: string; value: string }>;
  set(extension: string, key: string, value: string): void;
  delete(extension: string, key: string): boolean;
}

export function createExtensionStateService(db: Database): ExtensionStateService {
  const selectByKey = db.prepare<{ value: string }, [string, string]>(
    "SELECT value FROM extension_state WHERE extension = ? AND key = ?",
  );
  const upsert = db.prepare<void, [string, string, string, number, number]>(
    `INSERT INTO extension_state(extension, key, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(extension, key)
     DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const deleteByKey = db.prepare<void, [string, string]>(
    "DELETE FROM extension_state WHERE extension = ? AND key = ?",
  );
  const selectAll = db.prepare<{ key: string; value: string }, [string]>(
    "SELECT key, value FROM extension_state WHERE extension = ? ORDER BY key ASC",
  );

  return {
    get(extension, key) { return selectByKey.get(extension, key)?.value ?? null; },
    list(extension) { return selectAll.all(extension); },
    set(extension, key, value) { const now = Date.now(); upsert.run(extension, key, value, now, now); },
    delete(extension, key) { return deleteByKey.run(extension, key).changes > 0; },
  };
}
