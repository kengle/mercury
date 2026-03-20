import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Database } from "bun:sqlite";
import { createDatabase } from "../src/core/db.js";
import { createMessageService } from "../src/services/messages/service.js";
import type { MessageService } from "../src/services/messages/interface.js";

let tmpDir: string;
let db: Database;
let svc: MessageService;

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
    svc.create("user", "hello", "conv1");
    svc.create("assistant", "hi there", "conv1");
    const msgs = svc.list("conv1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  test("list respects conversation isolation", () => {
    svc.create("user", "a", "conv1");
    svc.create("user", "b", "conv2");
    expect(svc.list("conv1")).toHaveLength(1);
    expect(svc.list("conv2")).toHaveLength(1);
  });

  test("list returns empty when no messages", () => {
    expect(svc.list("conv1")).toHaveLength(0);
  });

  test("delete removes message", () => {
    svc.create("user", "hello", "conv1");
    const msgs = svc.list("conv1");
    expect(svc.delete(msgs[0].id)).toBe(true);
    expect(svc.list("conv1")).toHaveLength(0);
  });

  test("delete returns false for unknown id", () => {
    expect(svc.delete(999)).toBe(false);
  });

  test("create with attachments", () => {
    const att = [{ path: "/tmp/f.jpg", type: "image" as const, mimeType: "image/jpeg", filename: "f.jpg", sizeBytes: 100 }];
    svc.create("user", "look at this", "conv1", att);
    const msgs = svc.list("conv1");
    expect(msgs[0].attachments).toHaveLength(1);
    expect(msgs[0].attachments![0].filename).toBe("f.jpg");
  });

  test("session boundary resets context", () => {
    svc.create("user", "old question", "conv1");
    svc.create("assistant", "old answer", "conv1");
    const boundary = svc.setSessionBoundary("conv1");
    expect(boundary).toBeGreaterThan(0);

    // Messages before boundary are excluded
    expect(svc.list("conv1")).toHaveLength(0);

    // New messages after boundary are included
    svc.create("user", "new question", "conv1");
    svc.create("assistant", "new answer", "conv1");
    expect(svc.list("conv1")).toHaveLength(2);
  });

  test("session boundary is per-conversation", () => {
    svc.create("user", "a", "conv1");
    svc.create("user", "b", "conv2");
    svc.setSessionBoundary("conv1");
    expect(svc.list("conv1")).toHaveLength(0);
    expect(svc.list("conv2")).toHaveLength(1);
  });

  test("getSessionBoundary returns 0 when unset", () => {
    expect(svc.getSessionBoundary("conv1")).toBe(0);
  });
});
