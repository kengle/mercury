#!/usr/bin/env bun

import { Command } from "commander";

const API_URL = process.env.API_URL;
const CALLER_ID = process.env.CALLER_ID;
const CONVERSATION_ID = process.env.CONVERSATION_ID;

if (!API_URL) { process.stderr.write("error: API_URL not set\n"); process.exit(1); }
if (!CALLER_ID) { process.stderr.write("error: CALLER_ID not set\n"); process.exit(1); }

const API_KEY = process.env.MERCURY_API_KEY;

const headers: Record<string, string> = {
  "x-mercury-caller": CALLER_ID,
  "content-type": "application/json",
};
if (API_KEY) headers.authorization = `Bearer ${API_KEY}`;
if (CONVERSATION_ID) headers["x-mercury-conversation"] = CONVERSATION_ID;

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : JSON.stringify(data);
    process.stderr.write(`error: ${res.status} — ${msg}\n`);
    process.exit(1);
  }
  return data;
}

function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

const program = new Command();
program.name("mrctl").description("Manage Mercury from inside the agent container");

program.command("whoami").description("Show caller info and permissions").action(async () => {
  print(await api("GET", "/api/whoami"));
});

// Tasks
const tasksCmd = program.command("tasks").description("Manage scheduled tasks");

tasksCmd.command("list").description("List all tasks").action(async () => {
  print(await api("GET", "/api/tasks"));
});

tasksCmd.command("create")
  .description("Create a task")
  .option("--cron <expr>", "Cron expression for recurring tasks")
  .option("--at <time>", "ISO timestamp for one-shot tasks")
  .requiredOption("--prompt <text>", "Task prompt")
  .option("--silent", "Don't send output to chat")
  .action(async (opts) => {
    if (!opts.cron && !opts.at) { process.stderr.write("error: Must specify --cron or --at\n"); process.exit(1); }
    print(await api("POST", "/api/tasks", { cron: opts.cron, at: opts.at, prompt: opts.prompt, silent: opts.silent ?? false }));
  });

tasksCmd.command("pause <id>").description("Pause a task").action(async (id) => {
  print(await api("POST", `/api/tasks/${id}/pause`));
});

tasksCmd.command("resume <id>").description("Resume a task").action(async (id) => {
  print(await api("POST", `/api/tasks/${id}/resume`));
});

tasksCmd.command("run <id>").description("Trigger a task immediately").action(async (id) => {
  print(await api("POST", `/api/tasks/${id}/run`));
});

tasksCmd.command("delete <id>").description("Delete a task").action(async (id) => {
  print(await api("DELETE", `/api/tasks/${id}`));
});

// Config
const configCmd = program.command("config").description("Manage configuration");

configCmd.command("get [key]").description("Get config value(s)").action(async (key?: string) => {
  const data = (await api("GET", "/api/config")) as { config: Record<string, string> };
  if (key) {
    const value = data.config[key];
    if (value === undefined) { process.stderr.write(`error: Config key not set: ${key}\n`); process.exit(1); }
    process.stdout.write(`${value}\n`);
  } else {
    print(data);
  }
});

configCmd.command("set <key> <value>").description("Set a config value").action(async (key, value) => {
  print(await api("PUT", "/api/config", { key, value }));
});

// Roles
const rolesCmd = program.command("roles").description("Manage user roles");

rolesCmd.command("list").description("List all roles").action(async () => {
  print(await api("GET", "/api/roles"));
});

rolesCmd.command("grant <userId>").description("Grant a role to a user")
  .option("--role <role>", "Role to grant", "admin")
  .action(async (userId, opts) => {
    print(await api("POST", "/api/roles", { userId, role: opts.role }));
  });

rolesCmd.command("revoke <userId>").description("Revoke a user's role").action(async (userId) => {
  print(await api("DELETE", `/api/roles/${encodeURIComponent(userId)}`));
});

// Permissions
const permsCmd = program.command("permissions").description("Manage permissions");

permsCmd.command("show").description("Show permissions")
  .option("--role <role>", "Show for a specific role")
  .action(async (opts) => {
    const query = opts.role ? `?role=${encodeURIComponent(opts.role)}` : "";
    print(await api("GET", `/api/permissions${query}`));
  });

permsCmd.command("set <role> <permissions>").description("Set role permissions (comma-separated)").action(async (role, permsStr) => {
  const permissions = permsStr.split(",").map((s: string) => s.trim()).filter(Boolean);
  print(await api("PUT", "/api/permissions", { role, permissions }));
});

// Conversations
program.command("conversations").description("List conversations").action(async () => {
  const data = (await api("GET", "/api/conversations")) as {
    conversations: Array<{ id: number; platform: string; externalId: string; observedTitle: string | null; paired: number }>;
  };
  for (const c of data.conversations) {
    const title = c.observedTitle || c.externalId;
    const status = c.paired ? "✓ paired" : "  unpaired";
    process.stdout.write(`${c.id}\t${status}\t${c.platform}\t${title}\n`);
  }
});

// Mute
program.command("mute <userId> <duration>")
  .description("Mute a user (e.g. 10m, 1h, 24h)")
  .option("--reason <reason>", "Reason for muting")
  .option("--confirm", "Confirm the mute action")
  .action(async (userId, duration, opts) => {
    const result = (await api("POST", "/api/mutes", {
      userId, duration, reason: opts.reason, confirm: opts.confirm ?? false,
    })) as { warning?: boolean; message?: string };
    if (result.warning) {
      process.stdout.write(`${result.message}\n\nTo confirm: mrctl mute ${userId} ${duration}${opts.reason ? ` --reason "${opts.reason}"` : ""} --confirm\n`);
    } else {
      print(result);
    }
  });

program.command("unmute <userId>").description("Unmute a user").action(async (userId) => {
  print(await api("DELETE", `/api/mutes/${encodeURIComponent(userId)}`));
});

program.command("mutes").description("List active mutes").action(async () => {
  print(await api("GET", "/api/mutes"));
});

// Control
program.command("stop").description("Abort current run and clear queue").action(async () => {
  print(await api("POST", "/api/stop"));
});

program.command("compact").description("Reset session (fresh context)").action(async () => {
  print(await api("POST", "/api/compact"));
});

program.parse();
