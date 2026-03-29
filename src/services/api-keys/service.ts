import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import type { ApiKeyInfo, ApiKeyService } from "./interface.js";

type ApiKeyRow = {
  id: number;
  name: string;
  key_hash: string;
  key_prefix: string;
  created_at: number;
  revoked_at: number | null;
};

function toInfo(row: ApiKeyRow): ApiKeyInfo {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateKey(): string {
  return `mk_${randomBytes(24).toString("base64url")}`;
}

export function createApiKeyService(db: Database): ApiKeyService {
  const insert = db.prepare<void, [string, string, string, number]>(
    "INSERT INTO api_keys(name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?)",
  );
  const selectAll = db.prepare<ApiKeyRow, []>(
    "SELECT * FROM api_keys ORDER BY created_at DESC",
  );
  const selectByHash = db.prepare<ApiKeyRow, [string]>(
    "SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
  );
  const revokeById = db.prepare<void, [number, number]>(
    "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
  );

  return {
    create(name) {
      const key = generateKey();
      const keyHash = hashKey(key);
      const keyPrefix = key.slice(0, 7);
      const now = Date.now();
      insert.run(name, keyHash, keyPrefix, now);
      return {
        key,
        info: {
          id: Number(
            (
              db.query("SELECT last_insert_rowid() as id").get() as {
                id: number;
              }
            ).id,
          ),
          name,
          keyPrefix,
          createdAt: now,
          revokedAt: null,
        },
      };
    },

    list() {
      return selectAll.all().map(toInfo);
    },

    revoke(id) {
      return revokeById.run(Date.now(), id).changes > 0;
    },

    validate(key) {
      const row = selectByHash.get(hashKey(key));
      return row !== null && row !== undefined;
    },
  };
}
