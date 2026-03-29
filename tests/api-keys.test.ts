import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import type { ApiKeyService } from "../src/services/api-keys/interface.js";
import { createApiKeyService } from "../src/services/api-keys/service.js";

let tmpDir: string;
let db: Database;
let svc: ApiKeyService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-apikeys-"));
  db = createDatabase(path.join(tmpDir, "state.db"));
  svc = createApiKeyService(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ApiKeyService", () => {
  test("create returns key and info", () => {
    const { key, info } = svc.create("test-key");
    expect(key).toMatch(/^mk_/);
    expect(info.name).toBe("test-key");
    expect(info.keyPrefix).toBe(key.slice(0, 7));
    expect(info.revokedAt).toBeNull();
  });

  test("validate returns true for valid key", () => {
    const { key } = svc.create("test-key");
    expect(svc.validate(key)).toBe(true);
  });

  test("validate returns false for unknown key", () => {
    expect(svc.validate("mk_bogus")).toBe(false);
  });

  test("validate returns false for revoked key", () => {
    const { key, info } = svc.create("test-key");
    svc.revoke(info.id);
    expect(svc.validate(key)).toBe(false);
  });

  test("list returns all keys", () => {
    svc.create("key-1");
    svc.create("key-2");
    const keys = svc.list();
    expect(keys).toHaveLength(2);
  });

  test("revoke marks key as revoked", () => {
    const { info } = svc.create("test-key");
    expect(svc.revoke(info.id)).toBe(true);
    const keys = svc.list();
    expect(keys[0].revokedAt).not.toBeNull();
  });

  test("revoke returns false for unknown id", () => {
    expect(svc.revoke(999)).toBe(false);
  });

  test("revoke returns false for already revoked key", () => {
    const { info } = svc.create("test-key");
    svc.revoke(info.id);
    expect(svc.revoke(info.id)).toBe(false);
  });

  test("multiple keys can coexist", () => {
    const { key: key1 } = svc.create("key-1");
    const { key: key2 } = svc.create("key-2");
    expect(svc.validate(key1)).toBe(true);
    expect(svc.validate(key2)).toBe(true);
  });

  test("revoking one key doesn't affect others", () => {
    const { key: key1, info: info1 } = svc.create("key-1");
    const { key: key2 } = svc.create("key-2");
    svc.revoke(info1.id);
    expect(svc.validate(key1)).toBe(false);
    expect(svc.validate(key2)).toBe(true);
  });
});
