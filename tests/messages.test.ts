import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import type { MessageService } from "../src/services/messages/interface.js";
import { createMessageService } from "../src/services/messages/service.js";

let tmpDir: string;
let db: Database;
let svc: MessageService;
const W = 1; // workspace id for tests

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-msg-"));
  db = createDatabase(path.join(tmpDir, "state.db"));
  svc = createMessageService(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("MessageService", () => {
  test("create and list", () => {
    svc.create(W, "conv1", "user", "hello");
    svc.create(W, "conv1", "assistant", "hi there");
    const msgs = svc.list(W, "conv1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  test("list respects conversation isolation", () => {
    svc.create(W, "conv1", "user", "a");
    svc.create(W, "conv2", "user", "b");
    expect(svc.list(W, "conv1")).toHaveLength(1);
    expect(svc.list(W, "conv2")).toHaveLength(1);
  });

  test("list returns empty when no messages", () => {
    expect(svc.list(W, "conv1")).toHaveLength(0);
  });

  test("delete removes message", () => {
    svc.create(W, "conv1", "user", "hello");
    const msgs = svc.list(W, "conv1");
    expect(svc.delete(msgs[0].id)).toBe(true);
    expect(svc.list(W, "conv1")).toHaveLength(0);
  });

  test("delete returns false for unknown id", () => {
    expect(svc.delete(999)).toBe(false);
  });

  test("create with attachments", () => {
    const att = [
      {
        path: "/tmp/f.jpg",
        type: "image" as const,
        mimeType: "image/jpeg",
        filename: "f.jpg",
        sizeBytes: 100,
      },
    ];
    svc.create(W, "conv1", "user", "look at this", att);
    const msgs = svc.list(W, "conv1");
    expect(msgs[0].attachments).toHaveLength(1);
    expect(msgs[0].attachments![0].filename).toBe("f.jpg");
  });

  test("session boundary resets context", () => {
    svc.create(W, "conv1", "user", "old question");
    svc.create(W, "conv1", "assistant", "old answer");
    const boundary = svc.setSessionBoundary(W, "conv1");
    expect(boundary).toBeGreaterThan(0);
    expect(svc.list(W, "conv1")).toHaveLength(0);
    svc.create(W, "conv1", "user", "new question");
    svc.create(W, "conv1", "assistant", "new answer");
    expect(svc.list(W, "conv1")).toHaveLength(2);
  });

  test("session boundary is per-conversation", () => {
    svc.create(W, "conv1", "user", "a");
    svc.create(W, "conv2", "user", "b");
    svc.setSessionBoundary(W, "conv1");
    expect(svc.list(W, "conv1")).toHaveLength(0);
    expect(svc.list(W, "conv2")).toHaveLength(1);
  });

  test("getSessionBoundary returns 0 when unset", () => {
    expect(svc.getSessionBoundary(W, "conv1")).toBe(0);
  });
});
