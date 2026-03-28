import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type AppConfig,
  loadWorkspaceConfig,
  mergeWorkspaceConfig,
  parseEnvFile,
} from "../src/core/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-wscfg-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const baseConfig: AppConfig = {
  logLevel: "info",
  logFormat: "text",
  modelProvider: "anthropic",
  model: "claude-sonnet-4-6",
  triggerPatterns: "@Pi,Pi",
  triggerMatch: "mention",
  agentTimeoutMs: 900000,
  rateLimitPerUser: 10,
  rateLimitWindowMs: 60000,
  port: 8787,
  botUsername: "mercury",
  enableDiscord: false,
  discordGatewayDurationMs: 600000,
  enableSlack: false,
  enableTeams: false,
  enableWhatsApp: false,
  mediaEnabled: true,
  mediaMaxSizeMb: 10,
  otelService: "mercury",
  projectRoot: ".",
  dbPath: "./state.db",
  workspacesDir: "./workspaces",
  whatsappAuthDir: "./whatsapp-auth",
};

describe("parseEnvFile", () => {
  test("parses key=value pairs", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "FOO=bar\nBAZ=qux\n");
    expect(parseEnvFile(envPath)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("handles quotes", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "FOO=\"hello world\"\nBAR='single'\n");
    expect(parseEnvFile(envPath)).toEqual({
      FOO: "hello world",
      BAR: "single",
    });
  });

  test("skips comments and empty lines", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "# comment\n\nFOO=bar\n  # another\n");
    expect(parseEnvFile(envPath)).toEqual({ FOO: "bar" });
  });

  test("returns empty for missing file", () => {
    expect(parseEnvFile(path.join(tmpDir, "nope"))).toEqual({});
  });
});

describe("loadWorkspaceConfig", () => {
  test("loads overrides from workspace .env", () => {
    const wsDir = path.join(tmpDir, "ws");
    fs.mkdirSync(wsDir);
    fs.writeFileSync(
      path.join(wsDir, ".env"),
      [
        "MERCURY_BOT_USERNAME=acme-bot",
        "MERCURY_MODEL=claude-haiku-4-5",
        "MERCURY_TRIGGER_PATTERNS=@Acme,acme",
        "MERCURY_AGENT_TIMEOUT_MS=300000",
        "MERCURY_GH_TOKEN=ghp_workspace_xxx",
      ].join("\n"),
    );

    const overrides = loadWorkspaceConfig(wsDir);
    expect(overrides.botUsername).toBe("acme-bot");
    expect(overrides.model).toBe("claude-haiku-4-5");
    expect(overrides.triggerPatterns).toBe("@Acme,acme");
    expect(overrides.agentTimeoutMs).toBe(300000);
    expect(overrides.env.MERCURY_GH_TOKEN).toBe("ghp_workspace_xxx");
  });

  test("returns empty overrides for missing .env", () => {
    const wsDir = path.join(tmpDir, "empty");
    fs.mkdirSync(wsDir);
    const overrides = loadWorkspaceConfig(wsDir);
    expect(overrides.botUsername).toBeUndefined();
    expect(overrides.model).toBeUndefined();
    expect(Object.keys(overrides.env)).toHaveLength(0);
  });
});

describe("mergeWorkspaceConfig", () => {
  test("overrides specified fields", () => {
    const overrides = loadWorkspaceConfig(tmpDir); // empty
    const wsDir = path.join(tmpDir, "ws");
    fs.mkdirSync(wsDir);
    fs.writeFileSync(
      path.join(wsDir, ".env"),
      "MERCURY_BOT_USERNAME=custom\nMERCURY_MODEL=gpt-4\n",
    );

    const wsOverrides = loadWorkspaceConfig(wsDir);
    const merged = mergeWorkspaceConfig(baseConfig, wsOverrides);

    expect(merged.botUsername).toBe("custom");
    expect(merged.model).toBe("gpt-4");
    // Non-overridden fields preserved
    expect(merged.port).toBe(8787);
    expect(merged.triggerPatterns).toBe("@Pi,Pi");
    expect(merged.enableWhatsApp).toBe(false);
  });

  test("preserves all base fields when no overrides", () => {
    const merged = mergeWorkspaceConfig(baseConfig, { env: {} });
    expect(merged).toEqual(baseConfig);
  });
});
