import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import type { MuteService } from "../src/services/mutes/interface.js";
import { createMuteService } from "../src/services/mutes/service.js";

let tmpDir: string;
let db: Database;
let svc: MuteService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-mutes-"));
  db = createDatabase(path.join(tmpDir, "state.db"));
  svc = createMuteService(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("MuteService", () => {
  test("two-step confirm: first call returns warning", () => {
    const result = svc.create(1, { userId: "user1", duration: "10m" }, "admin");
    expect(result.warning).toBeDefined();
    expect(svc.isMuted(1, "user1")).toBe(false);
  });

  test("two-step confirm: second call with confirm mutes", () => {
    const result = svc.create(
      1,
      { userId: "user1", duration: "10m", confirm: true },
      "admin",
    );
    expect(result.warning).toBeUndefined();
    expect(svc.isMuted(1, "user1")).toBe(true);
  });

  test("isMuted returns false for unmuted user", () => {
    expect(svc.isMuted(1, "user1")).toBe(false);
  });

  test("unmute removes mute", () => {
    svc.create(1, { userId: "user1", duration: "10m", confirm: true }, "admin");
    expect(svc.delete(1, "user1")).toBe(true);
    expect(svc.isMuted(1, "user1")).toBe(false);
  });

  test("unmute returns false for non-muted user", () => {
    expect(svc.delete(1, "unknown")).toBe(false);
  });

  test("list mutes", () => {
    svc.create(1, { userId: "user1", duration: "10m", confirm: true }, "admin");
    svc.create(1, { userId: "user2", duration: "1h", confirm: true }, "admin");
    const all = svc.list(1);
    expect(all).toHaveLength(2);
  });

  test("duration parsing: minutes", () => {
    svc.create(1, { userId: "user1", duration: "5m", confirm: true }, "admin");
    const mutes = svc.list(1);
    const mute = mutes.find((m) => m.userId === "user1")!;
    const expectedMs = 5 * 60 * 1000;
    expect(mute.expiresAt - mute.createdAt).toBeCloseTo(expectedMs, -100);
  });

  test("duration parsing: hours", () => {
    svc.create(1, { userId: "user1", duration: "2h", confirm: true }, "admin");
    const mute = svc.list(1)[0];
    const expectedMs = 2 * 60 * 60 * 1000;
    expect(mute.expiresAt - mute.createdAt).toBeCloseTo(expectedMs, -100);
  });

  test("duration parsing: days", () => {
    svc.create(1, { userId: "user1", duration: "1d", confirm: true }, "admin");
    const mute = svc.list(1)[0];
    const expectedMs = 24 * 60 * 60 * 1000;
    expect(mute.expiresAt - mute.createdAt).toBeCloseTo(expectedMs, -100);
  });

  test("invalid duration throws", () => {
    expect(() =>
      svc.create(
        1,
        { userId: "user1", duration: "abc", confirm: true },
        "admin",
      ),
    ).toThrow();
  });

  test("purgeExpiredMutes removes expired entries", () => {
    db.run(
      "INSERT INTO mutes(workspace_id, user_id, expires_at, muted_by, created_at) VALUES (?, ?, ?, ?, ?)",
      [1, "user1", Date.now() - 1000, "admin", Date.now() - 60000],
    );
    expect(svc.isMuted(1, "user1")).toBe(false);
    svc.purgeExpired();
    expect(svc.list(1)).toHaveLength(0);
  });
});
