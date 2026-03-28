import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { createApiApp } from "../src/core/api.js";
import type { AppConfig } from "../src/core/config.js";
import { createDatabase } from "../src/core/db.js";
import type { Agent, AgentInput } from "../src/core/runtime/agent-interface.js";
import { MercuryCoreRuntime } from "../src/core/runtime/runtime.js";
import type { AgentOutput } from "../src/core/types.js";
import { ExtensionRegistry } from "../src/extensions/loader.js";
import { createChatController } from "../src/services/chat/controller.js";
import { createChatService } from "../src/services/chat/service.js";
import { ConfigRegistry } from "../src/services/config/registry.js";
import { createConfigService } from "../src/services/config/service.js";
import { createConversationService } from "../src/services/conversations/service.js";
import { createMessageService } from "../src/services/messages/service.js";
import { createMuteService } from "../src/services/mutes/service.js";
import { createPolicyService } from "../src/services/policy/service.js";
import { createRoleService } from "../src/services/roles/service.js";
import { createTaskService } from "../src/services/tasks/service.js";
import { createUserService } from "../src/services/users/service.js";
import { createWorkspaceService } from "../src/services/workspaces/service.js";

let tmpDir: string;
let db: Database;
let core: MercuryCoreRuntime;
let app: Hono;
let agentCalls: AgentInput[];
let workspacesSvc: ReturnType<typeof createWorkspaceService>;

function makeConfig(dir: string): AppConfig {
  return {
    modelProvider: "anthropic",
    model: "test",
    triggerPatterns: "@bot,bot",
    triggerMatch: "word",
    projectRoot: dir,
    port: 0,
    botUsername: "bot",
    dbPath: path.join(dir, "state.db"),
    workspacesDir: path.join(dir, "workspaces"),
    whatsappAuthDir: path.join(dir, "wa-auth"),
    rateLimitPerUser: 0,
    rateLimitWindowMs: 60000,
    enableWhatsApp: false,
    enableDiscord: false,
    enableSlack: false,
  } as AppConfig;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-cli-ingress-"));
  fs.mkdirSync(path.join(tmpDir, "workspaces"), { recursive: true });
  db = createDatabase(path.join(tmpDir, "state.db"));
  const cfg = makeConfig(tmpDir);

  agentCalls = [];
  const mockAgent: Agent = {
    async run(input: AgentInput): Promise<AgentOutput> {
      agentCalls.push(input);
      return { text: `echo: ${input.prompt}`, files: [] };
    },
    abort() {
      return false;
    },
    kill() {},
    get isRunning() {
      return false;
    },
  };

  const configSvc = createConfigService(db);
  const rolesSvc = createRoleService(db, configSvc);
  const muteSvc = createMuteService(db);
  const wsRoot = path.join(tmpDir, "workspaces");
  workspacesSvc = createWorkspaceService(db, wsRoot, configSvc);
  workspacesSvc.create("default");
  const services = {
    config: configSvc,
    conversations: createConversationService(db, configSvc),
    messages: createMessageService(db),
    tasks: createTaskService(db, muteSvc),
    roles: rolesSvc,
    mutes: muteSvc,
    users: createUserService(db),
    policy: createPolicyService(cfg, rolesSvc, configSvc, muteSvc),
    workspaces: workspacesSvc,
  };

  core = new MercuryCoreRuntime({
    config: cfg,
    database: db,
    services,
    agent: mockAgent,
  });

  const chatService = createChatService(core);
  const registry = new ExtensionRegistry();
  const configRegistry = new ConfigRegistry();

  app = new Hono();
  app.route("/chat", createChatController(chatService));
  app.route(
    "/api",
    createApiApp({
      services,
      appConfig: cfg,
      agent: mockAgent,
      queue: core.queue,
      registry,
      configRegistry,
    }),
  );
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("CLI-only ingress", () => {
  test("POST /chat sends message and gets agent reply", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello world", workspace: "default" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { reply: string; files: any[] };
    expect(data.reply).toBe("echo: hello world");
    expect(data.files).toEqual([]);
    expect(agentCalls).toHaveLength(1);
    expect(agentCalls[0].prompt).toBe("hello world");
    expect(agentCalls[0].isDM).toBe(true);
  });

  test("POST /chat with callerId", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "hi",
        callerId: "user42",
        workspace: "default",
      }),
    });
    expect(res.status).toBe(200);
    expect(agentCalls[0].callerId).toBe("user42");
  });

  test("POST /chat with empty text returns 400", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("POST /chat without body returns 400", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/conversations works without adapters", async () => {
    const res = await app.request("/api/conversations", {
      headers: { "x-mercury-caller": "system" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { conversations: any[] };
    expect(data.conversations).toEqual([]);
  });

  test("GET /api/conversations/pairing-code returns per-workspace codes", async () => {
    const res = await app.request("/api/conversations/pairing-code", {
      headers: { "x-mercury-caller": "system" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      codes: Array<{ workspace: string; code: string }>;
    };
    expect(data.codes).toHaveLength(1);
    expect(data.codes[0].workspace).toBe("default");
    expect(data.codes[0].code).toMatch(/^[A-Z0-9]{6}$/);
  });

  test("messages are stored after /chat call", async () => {
    await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "store me", workspace: "default" }),
    });

    const ws = workspacesSvc.get("default")!;
    const msgs = core.services.messages.list(ws.id, "api:system", 200);
    const roles = msgs.map((m) => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
  });

  test("multiple conversations are isolated", async () => {
    await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "from alice",
        callerId: "alice",
        workspace: "default",
      }),
    });
    await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "from bob",
        callerId: "bob",
        workspace: "default",
      }),
    });

    const ws = workspacesSvc.get("default")!;
    const aliceMsgs = core.services.messages.list(ws.id, "api:alice", 200);
    const bobMsgs = core.services.messages.list(ws.id, "api:bob", 200);
    expect(aliceMsgs.some((m) => m.content === "from alice")).toBe(true);
    expect(bobMsgs.some((m) => m.content === "from bob")).toBe(true);
    expect(aliceMsgs.some((m) => m.content === "from bob")).toBe(false);
  });
});
