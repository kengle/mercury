import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Database } from "bun:sqlite";
import { createDatabase } from "../src/core/db.js";
import { createConfigService } from "../src/services/config/service.js";
import { createRoleService } from "../src/services/roles/service.js";
import type { RoleService } from "../src/services/roles/interface.js";

let tmpDir: string;
let db: Database;
let svc: RoleService;

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
    svc.set("user1", "admin", "test");
    expect(svc.get("user1")).toBe("admin");
  });

  test("get returns undefined for unknown user", () => {
    expect(svc.get("unknown")).toBeUndefined();
  });

  test("resolveRole returns member for unknown user", () => {
    expect(svc.resolveRole("unknown")).toBe("member");
  });

  test("resolveRole returns assigned role", () => {
    svc.set("user1", "admin", "test");
    expect(svc.resolveRole("user1")).toBe("admin");
  });

  test("list roles", () => {
    svc.set("user1", "admin", "test");
    svc.set("user2", "member", "test");
    const all = svc.list();
    expect(all).toHaveLength(2);
  });

  test("delete role", () => {
    svc.set("user1", "admin", "test");
    expect(svc.delete("user1")).toBe(true);
    expect(svc.get("user1")).toBeUndefined();
  });

  test("delete returns false for unknown user", () => {
    expect(svc.delete("unknown")).toBe(false);
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
