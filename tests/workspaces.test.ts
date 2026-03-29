import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import { createConfigService } from "../src/services/config/service.js";
import type { ConversationService } from "../src/services/conversations/interface.js";
import { createConversationService } from "../src/services/conversations/service.js";
import type { WorkspaceService } from "../src/services/workspaces/interface.js";
import { createWorkspaceService } from "../src/services/workspaces/service.js";

let tmpDir: string;
let db: Database;
let workspaces: WorkspaceService;
let conversations: ConversationService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-ws-"));
  db = createDatabase(path.join(tmpDir, "state.db"));
  const workspacesRoot = path.join(tmpDir, "workspaces");
  fs.mkdirSync(workspacesRoot, { recursive: true });
  const configService = createConfigService(db);
  workspaces = createWorkspaceService(db, workspacesRoot, configService);
  conversations = createConversationService(db, configService);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("WorkspaceService", () => {
  test("create and list", () => {
    workspaces.create("personal");
    workspaces.create("work");
    const all = workspaces.list();
    expect(all).toHaveLength(2);
    expect(all.map((w) => w.name)).toEqual(["personal", "work"]);
  });

  test("create scaffolds directory structure", () => {
    workspaces.create("test-ws");
    const wsDir = path.join(tmpDir, "workspaces", "test-ws");
    expect(fs.existsSync(wsDir)).toBe(true);
    expect(fs.existsSync(path.join(wsDir, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, ".pi/skills"))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, ".pi/extensions"))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, ".pi/prompts"))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, "inbox"))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, "outbox"))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, "knowledge"))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, "sessions"))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, ".messages"))).toBe(true);
  });

  test("create rejects duplicate names", () => {
    workspaces.create("personal");
    expect(() => workspaces.create("personal")).toThrow();
  });

  test("get by name", () => {
    workspaces.create("personal");
    const ws = workspaces.get("personal");
    expect(ws).not.toBeNull();
    expect(ws!.name).toBe("personal");
  });

  test("get returns null for unknown", () => {
    expect(workspaces.get("nope")).toBeNull();
  });

  test("getById", () => {
    const created = workspaces.create("personal");
    const ws = workspaces.getById(created.id);
    expect(ws).not.toBeNull();
    expect(ws!.name).toBe("personal");
  });

  test("delete removes workspace", () => {
    workspaces.create("temp");
    expect(workspaces.delete("temp")).toBe(true);
    expect(workspaces.get("temp")).toBeNull();
  });

  test("delete returns false for unknown", () => {
    expect(workspaces.delete("nope")).toBe(false);
  });

  test("delete fails if conversations assigned", () => {
    const ws = workspaces.create("busy");
    conversations.create("whatsapp", "conv1", "group");
    conversations.assignWorkspace("whatsapp", "conv1", ws.id);
    expect(() => workspaces.delete("busy")).toThrow(/conversation/);
  });

  test("delete succeeds after unassigning conversations", () => {
    const ws = workspaces.create("busy");
    conversations.create("whatsapp", "conv1", "group");
    conversations.assignWorkspace("whatsapp", "conv1", ws.id);
    conversations.unassignWorkspace("whatsapp", "conv1");
    expect(workspaces.delete("busy")).toBe(true);
  });

  test("getConversationCount", () => {
    const ws = workspaces.create("test");
    expect(workspaces.getConversationCount(ws.id)).toBe(0);
    conversations.create("whatsapp", "c1", "group");
    conversations.create("whatsapp", "c2", "dm");
    conversations.assignWorkspace("whatsapp", "c1", ws.id);
    expect(workspaces.getConversationCount(ws.id)).toBe(1);
    conversations.assignWorkspace("whatsapp", "c2", ws.id);
    expect(workspaces.getConversationCount(ws.id)).toBe(2);
  });
});

describe("Conversation workspace assignment", () => {
  test("assignWorkspace and getWorkspaceId", () => {
    const ws = workspaces.create("personal");
    conversations.create("whatsapp", "conv1", "group");
    expect(conversations.getWorkspaceId("whatsapp", "conv1")).toBeNull();
    conversations.assignWorkspace("whatsapp", "conv1", ws.id);
    expect(conversations.getWorkspaceId("whatsapp", "conv1")).toBe(ws.id);
  });

  test("unassignWorkspace clears workspace", () => {
    const ws = workspaces.create("personal");
    conversations.create("whatsapp", "conv1", "group");
    conversations.assignWorkspace("whatsapp", "conv1", ws.id);
    conversations.unassignWorkspace("whatsapp", "conv1");
    expect(conversations.getWorkspaceId("whatsapp", "conv1")).toBeNull();
  });

  test("isAssigned reflects workspace state", () => {
    const ws = workspaces.create("personal");
    conversations.create("whatsapp", "conv1", "group");
    expect(conversations.isAssigned("whatsapp", "conv1")).toBe(false);
    conversations.assignWorkspace("whatsapp", "conv1", ws.id);
    expect(conversations.isAssigned("whatsapp", "conv1")).toBe(true);
    conversations.unassignWorkspace("whatsapp", "conv1");
    expect(conversations.isAssigned("whatsapp", "conv1")).toBe(false);
  });

  test("workspaceId appears in entity", () => {
    const ws = workspaces.create("work");
    conversations.create("slack", "ch1", "group");
    conversations.assignWorkspace("slack", "ch1", ws.id);
    const conv = conversations.get("slack", "ch1");
    expect(conv!.workspaceId).toBe(ws.id);
  });

  test("list shows workspaceId", () => {
    const ws = workspaces.create("work");
    conversations.create("slack", "ch1", "group");
    conversations.create("slack", "ch2", "group");
    conversations.assignWorkspace("slack", "ch1", ws.id);
    const all = conversations.list();
    const ch1 = all.find((c) => c.externalId === "ch1");
    const ch2 = all.find((c) => c.externalId === "ch2");
    expect(ch1!.workspaceId).toBe(ws.id);
    expect(ch2!.workspaceId).toBeNull();
  });
});
