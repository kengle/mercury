import type { Database } from "bun:sqlite";
import type { UserEntity } from "./models.js";
import type { UserService } from "./interface.js";

export function createUserService(db: Database): UserService {
  const selectById = db.prepare<UserEntity, [string]>(
    `SELECT id, platform, display_name as displayName,
            first_seen_at as firstSeenAt, last_seen_at as lastSeenAt
     FROM users WHERE id = ?`,
  );
  const selectAll = db.prepare<UserEntity, []>(
    `SELECT id, platform, display_name as displayName,
            first_seen_at as firstSeenAt, last_seen_at as lastSeenAt
     FROM users ORDER BY last_seen_at DESC`,
  );
  const insertIgnore = db.prepare<void, [string, string, string | null, number, number]>(
    `INSERT OR IGNORE INTO users(id, platform, display_name, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const updateTouch = db.prepare<void, [string | null, number, string]>(
    `UPDATE users SET display_name = COALESCE(?, display_name), last_seen_at = ? WHERE id = ?`,
  );
  const updateName = db.prepare<void, [string | null, number, string]>(
    "UPDATE users SET display_name = ?, last_seen_at = ? WHERE id = ?",
  );
  const deleteById = db.prepare<void, [string]>("DELETE FROM users WHERE id = ?");

  return {
    get(id) {
      return selectById.get(id) ?? null;
    },
    list() {
      return selectAll.all();
    },
    ensure(id, platform, displayName) {
      const now = Date.now();
      insertIgnore.run(id, platform, displayName ?? null, now, now);
      updateTouch.run(displayName ?? null, now, id);
      return selectById.get(id)!;
    },
    update(id, displayName) {
      return updateName.run(displayName, Date.now(), id).changes > 0;
    },
    delete(id) {
      return deleteById.run(id).changes > 0;
    },
  };
}
