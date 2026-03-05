import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig } from "../src/config.js";
import { getNextCronDelay, JobRunner } from "../src/extensions/jobs.js";
import type {
  ExtensionMeta,
  MercuryExtensionContext,
} from "../src/extensions/types.js";
import { Db } from "../src/storage/db.js";

let tmpDir: string;
let db: Db;
let ctx: MercuryExtensionContext;
let runner: JobRunner;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-jobs-test-"));
  db = new Db(path.join(tmpDir, "test.db"));
  ctx = {
    db,
    config: {} as AppConfig,
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => ctx.log,
    } as unknown as MercuryExtensionContext["log"],
  };
  runner = new JobRunner();
});

afterEach(() => {
  runner.stop();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeExt(overrides: Partial<ExtensionMeta> = {}): ExtensionMeta {
  return {
    name: "test-ext",
    dir: tmpDir,
    hooks: new Map(),
    jobs: new Map(),
    configs: new Map(),
    widgets: [],
    ...overrides,
  };
}

describe("JobRunner", () => {
  test("interval job runs immediately", async () => {
    let runCount = 0;
    const ext = makeExt({
      jobs: new Map([
        [
          "counter",
          {
            interval: 100_000, // long enough to not re-fire during test
            run: async () => {
              runCount++;
            },
          },
        ],
      ]),
    });

    runner.start([ext], ctx);
    // Give the immediate run a tick
    await Bun.sleep(50);
    expect(runCount).toBe(1);
  });

  test("interval job runs multiple times", async () => {
    let runCount = 0;
    const ext = makeExt({
      jobs: new Map([
        [
          "fast",
          {
            interval: 30,
            run: async () => {
              runCount++;
            },
          },
        ],
      ]),
    });

    runner.start([ext], ctx);
    await Bun.sleep(120);
    expect(runCount).toBeGreaterThanOrEqual(3);
  });

  test("job errors are caught, don't crash", async () => {
    let errorCount = 0;
    let successCount = 0;

    const ext = makeExt({
      jobs: new Map([
        [
          "flaky",
          {
            interval: 30,
            run: async () => {
              if (errorCount < 2) {
                errorCount++;
                throw new Error("boom");
              }
              successCount++;
            },
          },
        ],
      ]),
    });

    runner.start([ext], ctx);
    await Bun.sleep(150);
    expect(errorCount).toBe(2);
    expect(successCount).toBeGreaterThanOrEqual(1);
  });

  test("stop clears all timers", async () => {
    let runCount = 0;
    const ext = makeExt({
      jobs: new Map([
        [
          "counter",
          {
            interval: 20,
            run: async () => {
              runCount++;
            },
          },
        ],
      ]),
    });

    runner.start([ext], ctx);
    await Bun.sleep(50);
    const countAtStop = runCount;
    runner.stop();
    await Bun.sleep(80);
    // Should not have run more after stop
    expect(runCount).toBe(countAtStop);
    expect(runner.activeCount).toBe(0);
  });

  test("multiple extensions with multiple jobs", async () => {
    const runs: string[] = [];

    const ext1 = makeExt({
      name: "ext1",
      jobs: new Map([
        [
          "a",
          {
            interval: 100_000,
            run: async () => {
              runs.push("ext1:a");
            },
          },
        ],
      ]),
    });

    const ext2 = makeExt({
      name: "ext2",
      jobs: new Map([
        [
          "b",
          {
            interval: 100_000,
            run: async () => {
              runs.push("ext2:b");
            },
          },
        ],
        [
          "c",
          {
            interval: 100_000,
            run: async () => {
              runs.push("ext2:c");
            },
          },
        ],
      ]),
    });

    runner.start([ext1, ext2], ctx);
    await Bun.sleep(50);
    expect(runs).toContain("ext1:a");
    expect(runs).toContain("ext2:b");
    expect(runs).toContain("ext2:c");
    expect(runner.activeCount).toBe(3);
  });

  test("start is idempotent", async () => {
    let runCount = 0;
    const ext = makeExt({
      jobs: new Map([
        [
          "once",
          {
            interval: 100_000,
            run: async () => {
              runCount++;
            },
          },
        ],
      ]),
    });

    runner.start([ext], ctx);
    runner.start([ext], ctx); // second call ignored
    await Bun.sleep(50);
    expect(runCount).toBe(1);
    expect(runner.activeCount).toBe(1);
  });

  test("extensions with no jobs are fine", () => {
    const ext = makeExt();
    runner.start([ext], ctx);
    expect(runner.activeCount).toBe(0);
  });
});

describe("getNextCronDelay", () => {
  test("returns non-null for valid cron", () => {
    const delay = getNextCronDelay("* * * * *");
    expect(delay).not.toBeNull();
    // Next minute should be within 60 seconds
    expect(delay!).toBeLessThanOrEqual(60_000);
    expect(delay!).toBeGreaterThanOrEqual(0);
  });

  test("returns null for invalid cron", () => {
    expect(getNextCronDelay("not a cron")).toBeNull();
  });

  test("specific time computes correct delay", () => {
    // "0 0 1 1 *" = midnight, January 1st — always in the future
    const delay = getNextCronDelay("0 0 1 1 *");
    expect(delay).not.toBeNull();
    expect(delay!).toBeGreaterThan(0);
  });
});

describe("cron job scheduling", () => {
  test("cron job registers a timer", () => {
    const ext = makeExt({
      jobs: new Map([
        [
          "cron-test",
          {
            cron: "* * * * *",
            run: async () => {},
          },
        ],
      ]),
    });

    runner.start([ext], ctx);
    expect(runner.activeCount).toBe(1);
  });
});
