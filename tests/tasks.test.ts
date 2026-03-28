import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/core/db.js";
import { createMuteService } from "../src/services/mutes/service.js";
import type { TaskService } from "../src/services/tasks/interface.js";
import { createTaskService } from "../src/services/tasks/service.js";

let tmpDir: string;
let db: Database;
let svc: TaskService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-tasks-"));
  db = createDatabase(path.join(tmpDir, "state.db"));
  svc = createTaskService(db, createMuteService(db), 500);
});

afterEach(() => {
  svc.stopScheduler();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("TaskService", () => {
  test("create cron task and list", () => {
    svc.create(1, {
      prompt: "say hi",
      cron: "0 * * * *",
      createdBy: "admin",
      conversationId: "conv1",
    });
    const all = svc.list(1);
    expect(all).toHaveLength(1);
    expect(all[0].prompt).toBe("say hi");
    expect(all[0].cron).toBe("0 * * * *");
  });

  test("create one-shot task", () => {
    const future = new Date(Date.now() + 60000).toISOString();
    svc.create(1, {
      prompt: "remind me",
      at: future,
      createdBy: "admin",
      conversationId: "conv1",
    });
    const all = svc.list(1);
    expect(all).toHaveLength(1);
    expect(all[0].at).toBeDefined();
  });

  test("delete task", () => {
    svc.create(1, {
      prompt: "say hi",
      cron: "0 * * * *",
      createdBy: "admin",
      conversationId: "conv1",
    });
    const all = svc.list(1);
    expect(svc.delete(all[0].id)).toBe(true);
    expect(svc.list(1)).toHaveLength(0);
  });

  test("delete returns false for unknown id", () => {
    expect(svc.delete(999)).toBe(false);
  });

  test("pause and resume", () => {
    svc.create(1, {
      prompt: "say hi",
      cron: "0 * * * *",
      createdBy: "admin",
      conversationId: "conv1",
    });
    const task = svc.list(1)[0];
    svc.pause(task.id);
    expect(svc.list(1)[0].active).toBe(false);
    svc.resume(task.id);
    expect(svc.list(1)[0].active).toBe(true);
  });

  test("missing cron and at throws", () => {
    expect(() =>
      svc.create(1, {
        prompt: "say hi",
        createdBy: "admin",
        conversationId: "conv1",
      }),
    ).toThrow();
  });

  test("invalid cron throws", () => {
    expect(() =>
      svc.create(1, {
        prompt: "say hi",
        cron: "invalid",
        createdBy: "admin",
        conversationId: "conv1",
      }),
    ).toThrow();
  });

  test("silent flag", () => {
    svc.create(1, {
      prompt: "say hi",
      cron: "0 * * * *",
      silent: true,
      createdBy: "admin",
      conversationId: "conv1",
    });
    expect(svc.list(1)[0].silent).toBeTruthy();
  });

  test("scheduler triggers callback for one-shot task", async () => {
    const triggered: string[] = [];
    const soon = new Date(Date.now() + 1000).toISOString();
    svc.create(1, {
      prompt: "fire",
      at: soon,
      createdBy: "admin",
      conversationId: "conv1",
    });

    svc.startScheduler(async (task) => {
      triggered.push(task.prompt);
    });

    await new Promise((r) => setTimeout(r, 3000));
    svc.stopScheduler();

    expect(triggered).toContain("fire");
  });
});
