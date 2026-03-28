import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import { createExtensionStateService } from "../src/extensions/state-service.js";
import { createConfigService } from "../src/services/config/service.js";
import { createMessageService } from "../src/services/messages/service.js";
import { createMuteService } from "../src/services/mutes/service.js";
import { createRoleService } from "../src/services/roles/service.js";
import { createTaskService } from "../src/services/tasks/service.js";
import { createWorkspaceService } from "../src/services/workspaces/service.js";

let tmpDir: string;
let db: Database;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-scope-"));
  db = createDatabase(path.join(tmpDir, "state.db"));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Per-workspace message isolation", () => {
  test("messages are scoped by workspaceId", () => {
    const svc = createMessageService(db);
    svc.create(1, "conv1", "user", "hello from ws1");
    svc.create(2, "conv1", "user", "hello from ws2");

    const ws1 = svc.list(1, "conv1");
    const ws2 = svc.list(2, "conv1");

    expect(ws1).toHaveLength(1);
    expect(ws1[0].content).toBe("hello from ws1");
    expect(ws2).toHaveLength(1);
    expect(ws2[0].content).toBe("hello from ws2");
  });

  test("session boundaries are scoped by workspaceId", () => {
    const svc = createMessageService(db);
    svc.create(1, "conv1", "user", "m1");
    svc.create(2, "conv1", "user", "m2");

    svc.setSessionBoundary(1, "conv1");
    expect(svc.getSessionBoundary(1, "conv1")).toBeGreaterThan(0);
    expect(svc.getSessionBoundary(2, "conv1")).toBe(0);
  });
});

describe("Per-workspace role isolation", () => {
  test("roles are scoped by workspaceId", () => {
    const cfg = createConfigService(db);
    const svc = createRoleService(db, cfg);

    svc.set(1, "user1", "admin", "pair");
    svc.set(2, "user1", "member", "system");

    expect(svc.get(1, "user1")).toBe("admin");
    expect(svc.get(2, "user1")).toBe("member");
    expect(svc.get(0, "user1")).toBeUndefined();
  });

  test("resolveRole scoped per workspace", () => {
    const cfg = createConfigService(db);
    const svc = createRoleService(db, cfg);

    svc.set(1, "user1", "admin", "pair");

    expect(svc.resolveRole(1, "user1")).toBe("admin");
    expect(svc.resolveRole(2, "user1")).toBe("member");
  });
});

describe("Per-workspace config isolation", () => {
  test("config is scoped by workspaceId", () => {
    const svc = createConfigService(db);

    svc.set(1, "rate_limit", "5", "admin");
    svc.set(2, "rate_limit", "20", "admin");

    expect(svc.get(1, "rate_limit")).toBe("5");
    expect(svc.get(2, "rate_limit")).toBe("20");
    expect(svc.get(0, "rate_limit")).toBeNull();
  });

  test("list returns only workspace-scoped config", () => {
    const svc = createConfigService(db);
    svc.set(1, "k1", "v1", "admin");
    svc.set(2, "k2", "v2", "admin");
    svc.set(1, "k3", "v3", "admin");

    expect(svc.list(1)).toHaveLength(2);
    expect(svc.list(2)).toHaveLength(1);
    expect(svc.list(0)).toHaveLength(0);
  });
});

describe("Per-workspace mute isolation", () => {
  test("mutes are scoped by workspaceId", () => {
    const svc = createMuteService(db);

    svc.create(1, { userId: "user1", duration: "10m", confirm: true }, "admin");

    expect(svc.isMuted(1, "user1")).toBe(true);
    expect(svc.isMuted(2, "user1")).toBe(false);
    expect(svc.isMuted(0, "user1")).toBe(false);
  });
});

describe("Per-workspace task isolation", () => {
  test("tasks list is scoped by workspaceId", () => {
    const muteSvc = createMuteService(db);
    const svc = createTaskService(db, muteSvc);

    svc.create(1, { cron: "0 * * * *", prompt: "ws1 task", silent: false });
    svc.create(2, { cron: "0 * * * *", prompt: "ws2 task", silent: false });

    expect(svc.list(1)).toHaveLength(1);
    expect(svc.list(1)[0].prompt).toBe("ws1 task");
    expect(svc.list(2)).toHaveLength(1);
    expect(svc.list(2)[0].prompt).toBe("ws2 task");
    expect(svc.list(0)).toHaveLength(0);
  });
});

describe("Per-workspace extension state isolation", () => {
  test("extension state is scoped by workspaceId", () => {
    const svc = createExtensionStateService(db);

    svc.set(1, "knowledge", "last_run", "100");
    svc.set(2, "knowledge", "last_run", "200");

    expect(svc.get(1, "knowledge", "last_run")).toBe("100");
    expect(svc.get(2, "knowledge", "last_run")).toBe("200");
    expect(svc.get(0, "knowledge", "last_run")).toBeNull();
  });
});

describe("Workspace pairing codes", () => {
  test("each workspace has its own pairing code", () => {
    const cfg = createConfigService(db);
    const wsRoot = path.join(tmpDir, "workspaces");
    fs.mkdirSync(wsRoot);
    const svc = createWorkspaceService(db, wsRoot, cfg);

    const ws1 = svc.create("ws1");
    const ws2 = svc.create("ws2");

    const code1 = svc.getPairingCode(ws1.id);
    const code2 = svc.getPairingCode(ws2.id);

    expect(code1).toMatch(/^[A-Z0-9]{6}$/);
    expect(code2).toMatch(/^[A-Z0-9]{6}$/);
    expect(code1).not.toBe(code2);
  });

  test("findByPairingCode returns correct workspace", () => {
    const cfg = createConfigService(db);
    const wsRoot = path.join(tmpDir, "workspaces");
    fs.mkdirSync(wsRoot);
    const svc = createWorkspaceService(db, wsRoot, cfg);

    const ws1 = svc.create("ws1");
    const ws2 = svc.create("ws2");
    const code1 = svc.getPairingCode(ws1.id);
    const code2 = svc.getPairingCode(ws2.id);

    expect(svc.findByPairingCode(code1)?.name).toBe("ws1");
    expect(svc.findByPairingCode(code2)?.name).toBe("ws2");
    expect(svc.findByPairingCode("BADCODE")).toBeNull();
  });

  test("regeneratePairingCode changes the code", () => {
    const cfg = createConfigService(db);
    const wsRoot = path.join(tmpDir, "workspaces");
    fs.mkdirSync(wsRoot);
    const svc = createWorkspaceService(db, wsRoot, cfg);

    const ws = svc.create("test");
    const code1 = svc.getPairingCode(ws.id);
    svc.regeneratePairingCode(ws.id);
    const code2 = svc.getPairingCode(ws.id);

    expect(code1).not.toBe(code2);
    expect(svc.findByPairingCode(code1)).toBeNull();
    expect(svc.findByPairingCode(code2)?.name).toBe("test");
  });
});
