import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import { createConfigService } from "../src/services/config/service.js";
import type { ConversationService } from "../src/services/conversations/interface.js";
import { createConversationService } from "../src/services/conversations/service.js";

let tmpDir: string;
let db: Database;
let svc: ConversationService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-conv-"));
  db = createDatabase(path.join(tmpDir, "state.db"));
  svc = createConversationService(db, createConfigService(db));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ConversationService", () => {
  test("create and list", () => {
    svc.create("whatsapp", "ext1", "group");
    svc.create("whatsapp", "ext2", "dm");
    const all = svc.list();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.externalId).sort()).toEqual(["ext1", "ext2"]);
  });

  test("create is idempotent", () => {
    svc.create("whatsapp", "ext1", "group");
    svc.create("whatsapp", "ext1", "group");
    expect(svc.list()).toHaveLength(1);
  });

  test("assign and unassign workspace", () => {
    svc.create("whatsapp", "ext1", "group");
    expect(svc.isAssigned("whatsapp", "ext1")).toBe(false);
    svc.assignWorkspace("whatsapp", "ext1", 1);
    expect(svc.isAssigned("whatsapp", "ext1")).toBe(true);
    expect(svc.getWorkspaceId("whatsapp", "ext1")).toBe(1);
    svc.unassignWorkspace("whatsapp", "ext1");
    expect(svc.isAssigned("whatsapp", "ext1")).toBe(false);
    expect(svc.getWorkspaceId("whatsapp", "ext1")).toBeNull();
  });

  test("get by platform and externalId", () => {
    svc.create("whatsapp", "ext1", "dm");
    const found = svc.get("whatsapp", "ext1");
    expect(found).not.toBeNull();
    expect(found!.externalId).toBe("ext1");
    expect(found!.kind).toBe("dm");
  });

  test("get returns null for unknown conversation", () => {
    expect(svc.get("whatsapp", "nonexistent")).toBeNull();
  });
});
