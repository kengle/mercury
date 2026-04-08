import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERMISSION_GUARD_PATH = join(__dirname, "permission-guard.ts");
const OTEL_EXTENSION_PATH = join(__dirname, "otel.ts");

import type { AppConfig } from "../config.js";
import { type Logger, logger } from "../logger.js";
import type {
  AgentOutput,
  MessageAttachment,
  StoredMessage,
} from "../types.js";
import { AgentError } from "./agent-error.js";
import { scanOutbox } from "./outbox.js";

function formatContextTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

function formatAttachments(attachments: MessageAttachment[]): string | null {
  if (attachments.length === 0) return null;

  const entries = attachments.map((att) => {
    const attrs = [
      `type="${att.type}"`,
      `path="${att.path}"`,
      `mime="${att.mimeType}"`,
    ];
    if (att.sizeBytes) attrs.push(`size="${att.sizeBytes}"`);
    if (att.filename) attrs.push(`filename="${att.filename}"`);
    return `  <attachment ${attrs.join(" ")} />`;
  });

  return ["<attachments>", ...entries, "</attachments>"].join("\n");
}

function buildSystemPrompt(extensionSystemPrompt?: string): string {
  let prompt = `You are Mercury, a concise personal AI assistant.
Prioritize practical outputs and explicit assumptions.

Files received from users (images, documents, voice notes) are saved to the \`inbox/\` directory in the current workspace. To send files back with your reply, write them to the \`outbox/\` directory — any files created or modified there during this run will be automatically attached to your response.

## Permissions & Security
Each run is triggered by a specific caller with a role (admin or member). The caller's role is provided in the user prompt as a <caller role="..." /> tag.
- **admin**: Full access to all tools and extensions.
- **member**: Limited access. Some tools and extensions are restricted.

**IMPORTANT: Your environment changes between callers.** When you see a new <caller /> tag with a different role, your available tools, API keys, and credentials may be completely different. A role="member" caller may lack access that a role="admin" caller has. Never reuse tool results from a previous caller — always re-check.

If a tool call is blocked with "Permission denied", this is a hard security boundary. Do NOT attempt to achieve the same result through alternative means — no curl, no direct API calls, no workarounds. Simply inform the user they do not have permission.

## Moderation
You can mute users who are being abusive, spamming, trying to exfiltrate secrets, or deliberately wasting the group's resources by triggering you for pointless nonsense. Use \`mrctl mute\` when you judge it necessary — you don't need to wait for an admin to ask. Warn the user first, then mute if they continue.`;

  if (extensionSystemPrompt) {
    prompt = `${prompt}\n\n${extensionSystemPrompt}`;
  }

  return prompt;
}

function buildPrompt(input: AgentInput): string {
  const parts: string[] = [];

  // Only expose role, not user ID or name (privacy protection)
  parts.push(`<caller role="${input.callerRole}" />`);
  parts.push("");

  const ambientEntries = input.messages
    .filter((m) => m.role === "ambient")
    .map((m) => {
      const ts = formatContextTimestamp(m.createdAt);
      return `  <message role="space" timestamp="${ts}">\n${m.content}\n  </message>`;
    });

  if (ambientEntries.length > 0) {
    parts.push("<ambient_messages>");
    parts.push(...ambientEntries);
    parts.push("</ambient_messages>");
    parts.push("");
  }

  if (input.attachments && input.attachments.length > 0) {
    const xml = formatAttachments(input.attachments);
    if (xml) {
      parts.push(xml);
      parts.push("");
    }
  }

  parts.push(input.prompt);
  return parts.join("\n");
}

export interface AgentInput {
  workspace: string;
  messages: StoredMessage[];
  prompt: string;
  callerId: string;
  callerRole: string;
  isDM: boolean;
  conversationId: string;
  authorName?: string;
  attachments?: MessageAttachment[];
  extraEnv?: Record<string, string>;
  extensionSystemPrompt?: string;
  workspaceId: number;
  workspaceName: string;
  modelProvider: string;
  model: string;
  agentTimeoutMs: number;
}

function sanitizeFilename(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

import type { Agent } from "./agent-interface.js";

export class SubprocessAgent implements Agent {
  private running: ChildProcess | null = null;
  private aborted = false;
  private timedOut = false;

  constructor(private readonly config: AppConfig) {}

  get isRunning(): boolean {
    return this.running !== null;
  }

  abort(): boolean {
    if (!this.running) return false;
    this.aborted = true;
    this.killProcessTree(this.running, "SIGTERM");
    const proc = this.running;
    setTimeout(() => {
      if (this.running === proc) this.killProcessTree(proc, "SIGKILL");
    }, 5000);
    return true;
  }

  kill(): void {
    if (!this.running) return;
    this.aborted = true;
    this.killProcessTree(this.running, "SIGKILL");
  }

  /**
   * Kill a process and all its children by killing the process group.
   * Uses negative PID to target the entire process group.
   */
  private killProcessTree(proc: ChildProcess, signal: NodeJS.Signals): void {
    try {
      // Try to kill the entire process group first (negative PID)
      process.kill(-proc.pid, signal);
      logger.debug("Sent signal to process group", { pid: proc.pid, signal, pgid: -proc.pid });
    } catch (groupError) {
      // If process group doesn't exist, fall back to killing just the main process
      try {
        proc.kill(signal);
        logger.debug("Sent signal to single process", { pid: proc.pid, signal });
      } catch (singleError) {
        logger.warn("Failed to kill process", {
          pid: proc.pid,
          signal,
          groupError: groupError instanceof Error ? groupError.message : String(groupError),
          singleError: singleError instanceof Error ? singleError.message : String(singleError),
        });
      }
    }
  }

  private wrapWithSandbox(
    command: string,
    args: string[],
    projectRoot: string,
    allowedPaths: string[],
  ): { cmd: string; cmdArgs: string[] } {
    if (process.platform === "darwin") {
      const allowRules = allowedPaths
        .map((p) => `(allow file-read* file-write* (subpath "${p}"))`)
        .join("\n");

      const profile = [
        "(version 1)",
        "(allow default)",
        `(deny file-read* file-write* (subpath "${projectRoot}"))`,
        allowRules,
      ].join("\n");

      return {
        cmd: "sandbox-exec",
        cmdArgs: ["-p", profile, command, ...args],
      };
    }

    // Running inside Docker, no need for additional sandboxing
    return { cmd: command, cmdArgs: args };
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    // projectRoot is the deployment root (parent of workspaces/<name>)
    const projectRoot = path.resolve(path.join(input.workspace, "..", ".."));
    const conversationId = sanitizeFilename(
      input.isDM ? `dm-${input.callerId}` : input.conversationId || "default",
    );
    // Sessions live under the workspace dir (workspaces/<name>/sessions/)
    const sessionDir = path.join(input.workspace, "sessions", conversationId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, "session.jsonl");

    const systemPrompt = buildSystemPrompt(input.extensionSystemPrompt);
    const userPrompt = buildPrompt(input);

    const args = [
      "--print",
      "--session",
      sessionFile,
      "--provider",
      input.modelProvider,
      "--model",
      input.model,
      "--append-system-prompt",
      systemPrompt,
      "-e",
      PERMISSION_GUARD_PATH,
    ];

    if (this.config.otelEndpoint) {
      args.push("-e", OTEL_EXTENSION_PATH);
    }

    args.push(userPrompt);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };

    env.CALLER_ID = input.callerId;
    env.CONVERSATION_ID = input.conversationId;
    env.API_URL = `http://localhost:${this.config.port}`;
    env.WORKSPACE_ID = String(input.workspaceId);
    env.WORKSPACE_NAME = input.workspaceName;

    if (input.extraEnv) {
      Object.assign(env, input.extraEnv);
    }

    const log: Logger = logger;
    const startTime = Date.now();

    const piAgentDir = path.join(projectRoot, "pi-agent");
    const { cmd, cmdArgs } = this.wrapWithSandbox("pi", args, projectRoot, [
      input.workspace, // sessions/ is now under workspace dir
      piAgentDir,
    ]);

    return new Promise<AgentOutput>((resolve, reject) => {
      const proc = spawn(cmd, cmdArgs, {
        cwd: input.workspace,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });

      this.running = proc;
      this.aborted = false;
      this.timedOut = false;
      log.info("Agent started", { event: "agent.start" });

      let stdout = "";
      let stderr = "";
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

      timeoutTimer = setTimeout(() => {
        if (this.running === proc) {
          this.timedOut = true;
          log.warn("Agent timeout, killing process tree", { event: "agent.timeout", pid: proc.pid });
          this.killProcessTree(proc, "SIGTERM");
          setTimeout(() => {
            if (this.running === proc) {
              this.killProcessTree(proc, "SIGKILL");
            }
          }, 5000);
        }
      }, input.agentTimeoutMs);

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (this.running === proc) this.running = null;
      };

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      proc.on("error", (error) => {
        cleanup();
        reject(error);
      });

      proc.on("close", (code) => {
        cleanup();
        const durationMs = Date.now() - startTime;

        if (this.timedOut) {
          log.warn("Agent exited", {
            event: "agent.end",
            exitCode: code,
            durationMs,
            reason: "timeout",
          });
          reject(AgentError.timeout());
          return;
        }

        if (this.aborted) {
          log.info("Agent exited", {
            event: "agent.end",
            exitCode: code,
            durationMs,
            reason: "aborted",
          });
          reject(AgentError.aborted());
          return;
        }

        if (code !== 0) {
          log.error("Agent exited", {
            event: "agent.end",
            exitCode: code,
            durationMs,
            reason: "error",
          });
          reject(AgentError.error(code ?? 1, stderr || stdout));
          return;
        }

        log.info("Agent exited", {
          event: "agent.end",
          exitCode: 0,
          durationMs,
        });

        const text = stdout.trim() || "Done.";
        const files = scanOutbox(input.workspace, startTime);
        resolve({ text, files });
      });
    });
  }
}
