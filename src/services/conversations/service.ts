import type { Database } from "bun:sqlite";
import type { ConversationEntity } from "./models.js";
import type { ConversationService } from "./interface.js";
import type { ConfigService } from "../config/interface.js";

const COLUMNS = `id, platform, external_id as externalId, kind,
  observed_title as observedTitle, paired,
  first_seen_at as firstSeenAt, last_seen_at as lastSeenAt`;

export function createConversationService(db: Database, config: ConfigService): ConversationService {
  const insertIgnore = db.prepare<void, [string, string, string, string | null, number, number]>(
    `INSERT OR IGNORE INTO conversations(
      platform, external_id, kind, observed_title, paired, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
  );
  const updateWithTitle = db.prepare<void, [string, string, number, string, string]>(
    `UPDATE conversations SET kind = ?, observed_title = ?, last_seen_at = ?
     WHERE platform = ? AND external_id = ?`,
  );
  const updateNoTitle = db.prepare<void, [string, number, string, string]>(
    `UPDATE conversations SET kind = ?, last_seen_at = ?
     WHERE platform = ? AND external_id = ?`,
  );
  const selectByPlatform = db.prepare<ConversationEntity, [string, string]>(
    `SELECT ${COLUMNS} FROM conversations WHERE platform = ? AND external_id = ?`,
  );
  const selectAll = db.prepare<ConversationEntity, []>(
    `SELECT ${COLUMNS} FROM conversations ORDER BY last_seen_at DESC`,
  );
  const setPaired = db.prepare<void, [string, string]>(
    "UPDATE conversations SET paired = 1 WHERE platform = ? AND external_id = ?",
  );
  const unsetPaired = db.prepare<void, [string, string]>(
    "UPDATE conversations SET paired = 0 WHERE platform = ? AND external_id = ?",
  );
  const selectPaired = db.prepare<{ paired: number }, [string, string]>(
    "SELECT paired FROM conversations WHERE platform = ? AND external_id = ?",
  );
  const updateById = db.prepare<void, [string | null, string | null, number | null, number, number]>(
    `UPDATE conversations SET
       kind = COALESCE(?, kind),
       observed_title = COALESCE(?, observed_title),
       paired = COALESCE(?, paired),
       last_seen_at = ?
     WHERE id = ?`,
  );
  const deleteById = db.prepare<void, [number]>("DELETE FROM conversations WHERE id = ?");

  const createTx = db.transaction(
    (platform: string, externalId: string, kind: string, observedTitle?: string) => {
      const now = Date.now();
      insertIgnore.run(platform, externalId, kind, observedTitle ?? null, now, now);
      if (observedTitle?.trim()) {
        updateWithTitle.run(kind, observedTitle, now, platform, externalId);
      } else {
        updateNoTitle.run(kind, now, platform, externalId);
      }
      const row = selectByPlatform.get(platform, externalId);
      if (!row) throw new Error(`Failed to load conversation ${platform}:${externalId}`);
      return row;
    },
  );

  return {
    get(platform, externalId) {
      return selectByPlatform.get(platform, externalId) ?? null;
    },
    list() {
      return selectAll.all();
    },
    create: createTx,
    update(id, input) {
      return updateById.run(
        input.kind ?? null,
        input.observedTitle ?? null,
        input.paired ?? null,
        Date.now(),
        id,
      ).changes > 0;
    },
    delete(id) {
      return deleteById.run(id).changes > 0;
    },
    pair(platform, externalId) {
      return setPaired.run(platform, externalId).changes > 0;
    },
    unpair(platform, externalId) {
      return unsetPaired.run(platform, externalId).changes > 0;
    },
    isPaired(platform, externalId) {
      return selectPaired.get(platform, externalId)?.paired === 1;
    },
    getPairingCode() {
      let code = config.get("_pairing_code");
      if (!code) {
        code = Math.random().toString(36).slice(2, 8).toUpperCase();
        config.set("_pairing_code", code, "system");
      }
      return code;
    },
    regeneratePairingCode() {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      config.set("_pairing_code", code, "system");
      return code;
    },
  };
}
