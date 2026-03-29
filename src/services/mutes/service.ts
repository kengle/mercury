import type { Database } from "bun:sqlite";
import type { MuteService } from "./interface.js";
import type { CreateMute, MuteEntity } from "./models.js";

type MuteRow = {
  user_id: string;
  expires_at: number;
  reason: string | null;
  muted_by: string;
  created_at: number;
};

function toEntity(r: MuteRow): MuteEntity {
  return {
    userId: r.user_id,
    expiresAt: r.expires_at,
    reason: r.reason,
    mutedBy: r.muted_by,
    createdAt: r.created_at,
  };
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error("Invalid duration format. Use: 10m, 1h, 24h, 7d");
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  return unit === "m"
    ? amount * 60_000
    : unit === "h"
      ? amount * 3_600_000
      : amount * 86_400_000;
}

export function createMuteService(db: Database): MuteService {
  const upsert = db.prepare<
    void,
    [number, string, number, string | null, string, number]
  >(
    `INSERT INTO mutes(workspace_id, user_id, expires_at, reason, muted_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, user_id) DO UPDATE SET
       expires_at = excluded.expires_at, reason = excluded.reason, muted_by = excluded.muted_by`,
  );
  const deleteById = db.prepare<void, [number, string]>(
    "DELETE FROM mutes WHERE workspace_id = ? AND user_id = ?",
  );
  const purgeStmt = db.prepare<void, [number]>(
    "DELETE FROM mutes WHERE expires_at <= ?",
  );
  const selectActive = db.prepare<MuteRow, [number, string, number]>(
    "SELECT user_id, expires_at, reason, muted_by, created_at FROM mutes WHERE workspace_id = ? AND user_id = ? AND expires_at > ?",
  );
  const selectAll = db.prepare<MuteRow, [number, number]>(
    "SELECT user_id, expires_at, reason, muted_by, created_at FROM mutes WHERE workspace_id = ? AND expires_at > ? ORDER BY expires_at ASC",
  );

  return {
    get(workspaceId, userId) {
      const row = selectActive.get(workspaceId, userId, Date.now());
      return row ? toEntity(row) : null;
    },
    list(workspaceId) {
      return selectAll.all(workspaceId, Date.now()).map(toEntity);
    },
    create(workspaceId, input, mutedBy) {
      const ms = parseDuration(input.duration);
      const expiresAt = Date.now() + ms;

      if (!input.confirm) {
        return {
          warning: `This will mute ${input.userId} for ${input.duration}.${input.reason ? ` Reason: ${input.reason}` : ""}`,
        };
      }

      upsert.run(
        workspaceId,
        input.userId,
        expiresAt,
        input.reason ?? null,
        mutedBy,
        Date.now(),
      );
      return {
        userId: input.userId,
        expiresAt,
        reason: input.reason ?? null,
        mutedBy,
        createdAt: Date.now(),
      };
    },
    delete(workspaceId, userId) {
      return deleteById.run(workspaceId, userId).changes > 0;
    },
    isMuted(workspaceId, userId) {
      return selectActive.get(workspaceId, userId, Date.now()) !== null;
    },
    purgeExpired() {
      return purgeStmt.run(Date.now()).changes;
    },
  };
}
