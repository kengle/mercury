import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadConfig, resolveProjectPath } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all MERCURY_ env vars before each test to isolate from .env file
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MERCURY_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original env after each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MERCURY_")) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  test("defaults", () => {
    const config = loadConfig();
    expect(config.dataDir).toBe(".mercury");
    expect(config.triggerPatterns).toBe("@Pi,Pi");
    expect(config.triggerMatch).toBe("mention");
    expect(config.maxConcurrency).toBe(2);
    expect(config.chatSdkPort).toBe(8787);
    expect(config.containerTimeoutMs).toBe(5 * 60 * 1000);
    expect(config.logLevel).toBe("info");
    expect(config.logFormat).toBe("text");
  });

  test("derived paths use dataDir", () => {
    process.env.MERCURY_DATA_DIR = "/custom/data";
    const config = loadConfig();
    expect(config.dbPath).toBe("/custom/data/state.db");
    expect(config.globalDir).toBe("/custom/data/global");
    expect(config.groupsDir).toBe("/custom/data/groups");
    expect(config.whatsappAuthDir).toBe("/custom/data/whatsapp-auth");
  });

  test("env overrides", () => {
    process.env.MERCURY_TRIGGER_PATTERNS = "@Bot,Bot";
    process.env.MERCURY_TRIGGER_MATCH = "prefix";
    process.env.MERCURY_MAX_CONCURRENCY = "4";
    process.env.MERCURY_CONTAINER_TIMEOUT_MS = "120000";
    process.env.MERCURY_LOG_LEVEL = "debug";
    process.env.MERCURY_LOG_FORMAT = "json";

    const config = loadConfig();
    expect(config.triggerPatterns).toBe("@Bot,Bot");
    expect(config.triggerMatch).toBe("prefix");
    expect(config.maxConcurrency).toBe(4);
    expect(config.containerTimeoutMs).toBe(120000);
    expect(config.logLevel).toBe("debug");
    expect(config.logFormat).toBe("json");
  });
});

describe("resolveProjectPath", () => {
  test("absolute path returns as-is", () => {
    expect(resolveProjectPath("/absolute/path")).toBe("/absolute/path");
  });

  test("relative path resolves against cwd", () => {
    const result = resolveProjectPath(".mercury/state.db");
    expect(result).toBe(path.join(process.cwd(), ".mercury/state.db"));
  });
});
