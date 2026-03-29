import type { Database } from "bun:sqlite";

export interface ExtensionStateService {
  get(workspaceId: number, extension: string, key: string): string | null;
  list(
    workspaceId: number,
    extension: string,
  ): Array<{ key: string; value: string }>;
  set(workspaceId: number, extension: string, key: string, value: string): void;
  delete(workspaceId: number, extension: string, key: string): boolean;
}

export function createExtensionStateService(
  db: Database,
): ExtensionStateService {
  const selectByKey = db.prepare<{ value: string }, [number, string, string]>(
    "SELECT value FROM extension_state WHERE workspace_id = ? AND extension = ? AND key = ?",
  );
  const upsert = db.prepare<
    void,
    [number, string, string, string, number, number]
  >(
    `INSERT INTO extension_state(workspace_id, extension, key, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, extension, key)
     DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const deleteByKey = db.prepare<void, [number, string, string]>(
    "DELETE FROM extension_state WHERE workspace_id = ? AND extension = ? AND key = ?",
  );
  const selectAll = db.prepare<
    { key: string; value: string },
    [number, string]
  >(
    "SELECT key, value FROM extension_state WHERE workspace_id = ? AND extension = ? ORDER BY key ASC",
  );

  return {
    get(workspaceId, extension, key) {
      return selectByKey.get(workspaceId, extension, key)?.value ?? null;
    },
    list(workspaceId, extension) {
      return selectAll.all(workspaceId, extension);
    },
    set(workspaceId, extension, key, value) {
      const now = Date.now();
      upsert.run(workspaceId, extension, key, value, now, now);
    },
    delete(workspaceId, extension, key) {
      return deleteByKey.run(workspaceId, extension, key).changes > 0;
    },
  };
}
