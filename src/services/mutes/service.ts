import type { Database } from "bun:sqlite";
import type { CreateMute, MuteEntity } from "./models.js";
import type { MuteService } from "./interface.js";

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
  return unit === "m" ? amount * 60_000 : unit === "h" ? amount * 3_600_000 : amount * 86_400_000;
}

export function createMuteService(db: Database): MuteService {
  const upsert = db.prepare<void, [string, number, string | null, string, number]>(
    `INSERT INTO mutes(user_id, expires_at, reason, muted_by, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       expires_at = excluded.expires_at, reason = excluded.reason, muted_by = excluded.muted_by`,
  );
  const deleteById = db.prepare<void, [string]>("DELETE FROM mutes WHERE user_id = ?");
  const purgeStmt = db.prepare<void, [number]>("DELETE FROM mutes WHERE expires_at <= ?");
  const selectActive = db.prepare<MuteRow, [string, number]>(
    "SELECT user_id, expires_at, reason, muted_by, created_at FROM mutes WHERE user_id = ? AND expires_at > ?",
  );
  const selectAll = db.prepare<MuteRow, [number]>(
    "SELECT user_id, expires_at, reason, muted_by, created_at FROM mutes WHERE expires_at > ? ORDER BY expires_at ASC",
  );

  return {
    get(userId) {
      const row = selectActive.get(userId, Date.now());
      return row ? toEntity(row) : null;
    },
    list() {
      return selectAll.all(Date.now()).map(toEntity);
    },
    create(input, mutedBy) {
      const ms = parseDuration(input.duration);
      const expiresAt = Date.now() + ms;

      if (!input.confirm) {
        return {
          warning: `This will mute ${input.userId} for ${input.duration}.${input.reason ? ` Reason: ${input.reason}` : ""}`,
        };
      }

      upsert.run(input.userId, expiresAt, input.reason ?? null, mutedBy, Date.now());
      return {
        userId: input.userId,
        expiresAt,
        reason: input.reason ?? null,
        mutedBy,
        createdAt: Date.now(),
      };
    },
    delete(userId) {
      return deleteById.run(userId).changes > 0;
    },
    isMuted(userId) {
      return selectActive.get(userId, Date.now()) !== null;
    },
    purgeExpired() {
      return purgeStmt.run(Date.now()).changes;
    },
  };
}
