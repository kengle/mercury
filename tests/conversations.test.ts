import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Database } from "bun:sqlite";
import { createDatabase } from "../src/core/db.js";
import { createConfigService } from "../src/services/config/service.js";
import { createConversationService } from "../src/services/conversations/service.js";
import type { ConversationService } from "../src/services/conversations/interface.js";

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

  test("pair and isPaired", () => {
    svc.create("whatsapp", "ext1", "group");
    expect(svc.isPaired("whatsapp", "ext1")).toBe(false);
    svc.pair("whatsapp", "ext1");
    expect(svc.isPaired("whatsapp", "ext1")).toBe(true);
  });

  test("unpair by platform and externalId", () => {
    svc.create("whatsapp", "ext1", "group");
    svc.pair("whatsapp", "ext1");
    svc.unpair("whatsapp", "ext1");
    expect(svc.isPaired("whatsapp", "ext1")).toBe(false);
  });

  test("pairing code generation and regeneration", () => {
    const code1 = svc.getPairingCode();
    expect(code1).toMatch(/^[A-Z0-9]{6}$/);
    svc.regeneratePairingCode();
    const code2 = svc.getPairingCode();
    expect(code2).toMatch(/^[A-Z0-9]{6}$/);
    expect(code2).not.toBe(code1);
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
