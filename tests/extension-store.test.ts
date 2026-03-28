import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import {
  createExtensionStateService,
  type ExtensionStateService,
} from "../src/extensions/state-service.js";

describe("extension_state", () => {
  let db: Database;
  let extState: ExtensionStateService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-ext-store-"));
    db = createDatabase(path.join(tmpDir, "state.db"));
    extState = createExtensionStateService(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("get returns null for missing key", () => {
    expect(extState.get(0, "napkin", "missing")).toBeNull();
  });

  it("set then get returns value", () => {
    extState.set(0, "napkin", "last-run", "123456");
    expect(extState.get(0, "napkin", "last-run")).toBe("123456");
  });

  it("set overwrites existing value", () => {
    extState.set(0, "napkin", "count", "1");
    extState.set(0, "napkin", "count", "2");
    expect(extState.get(0, "napkin", "count")).toBe("2");
  });

  it("namespace isolation — two extensions with same key", () => {
    extState.set(0, "napkin", "status", "ok");
    extState.set(0, "kb-distill", "status", "running");

    expect(extState.get(0, "napkin", "status")).toBe("ok");
    expect(extState.get(0, "kb-distill", "status")).toBe("running");
  });

  it("delete removes key and returns true", () => {
    extState.set(0, "napkin", "tmp", "val");
    expect(extState.delete(0, "napkin", "tmp")).toBe(true);
    expect(extState.get(0, "napkin", "tmp")).toBeNull();
  });

  it("delete returns false for missing key", () => {
    expect(extState.delete(0, "napkin", "nope")).toBe(false);
  });

  it("list returns all keys for extension", () => {
    extState.set(0, "napkin", "a", "1");
    extState.set(0, "napkin", "b", "2");
    extState.set(0, "other", "c", "3");

    const items = extState.list(0, "napkin");
    expect(items).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
  });

  it("list returns empty array when no keys", () => {
    expect(extState.list(0, "empty")).toEqual([]);
  });
});
