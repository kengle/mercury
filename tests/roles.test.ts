import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import { createConfigService } from "../src/services/config/service.js";
import type { RoleService } from "../src/services/roles/interface.js";
import { createRoleService } from "../src/services/roles/service.js";

let tmpDir: string;
let db: Database;
let svc: RoleService;
const W = 1;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-roles-"));
  db = createDatabase(path.join(tmpDir, "state.db"));
  svc = createRoleService(db, createConfigService(db));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("RoleService", () => {
  test("set and get role", () => {
    svc.set(W, "user1", "admin", "test");
    expect(svc.get(W, "user1")).toBe("admin");
  });

  test("get returns undefined for unknown user", () => {
    expect(svc.get(W, "unknown")).toBeUndefined();
  });

  test("resolveRole returns member for unknown user", () => {
    expect(svc.resolveRole(W, "unknown")).toBe("member");
  });

  test("resolveRole returns assigned role", () => {
    svc.set(W, "user1", "admin", "test");
    expect(svc.resolveRole(W, "user1")).toBe("admin");
  });

  test("list roles", () => {
    svc.set(W, "user1", "admin", "test");
    svc.set(W, "user2", "member", "test");
    const all = svc.list(W);
    expect(all).toHaveLength(2);
  });

  test("delete role", () => {
    svc.set(W, "user1", "admin", "test");
    expect(svc.delete(W, "user1")).toBe(true);
    expect(svc.get(W, "user1")).toBeUndefined();
  });

  test("delete returns false for unknown user", () => {
    expect(svc.delete(W, "unknown")).toBe(false);
  });

  test("admin has all registered permissions", () => {
    expect(svc.hasPermission("admin", "prompt.group")).toBe(true);
    expect(svc.hasPermission("admin", "prompt.dm")).toBe(true);
  });

  test("admin has dynamically registered permissions", () => {
    svc.registerPermission("custom.perm", { defaultRoles: [] });
    expect(svc.hasPermission("admin", "custom.perm")).toBe(true);
  });

  test("member has prompt.group by default", () => {
    expect(svc.hasPermission("member", "prompt.group")).toBe(true);
  });

  test("member does not have prompt.dm by default", () => {
    expect(svc.hasPermission("member", "prompt.dm")).toBe(false);
  });

  test("guest has no permissions", () => {
    expect(svc.hasPermission("guest", "prompt.group")).toBe(false);
    expect(svc.hasPermission("guest", "prompt.dm")).toBe(false);
  });

  test("registerPermission adds to default roles", () => {
    svc.registerPermission("custom.perm", { defaultRoles: ["member"] });
    expect(svc.hasPermission("member", "custom.perm")).toBe(true);
    expect(svc.hasPermission("guest", "custom.perm")).toBe(false);
  });

  test("getRolePermissions lists all permissions for role", () => {
    const perms = svc.getRolePermissions("member");
    expect(perms).toContain("prompt.group");
    expect(perms).not.toContain("prompt.dm");
  });
});
