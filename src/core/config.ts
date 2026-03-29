import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Parse boolean from env var strings — case-insensitive "true"/"1" → true, everything else → false */
const booleanFromEnv = z.union([z.boolean(), z.string()]).transform((val) => {
  if (typeof val === "boolean") return val;
  const lower = val.toLowerCase();
  return lower === "true" || lower === "1";
});

const schema = z.object({
  // ─── Logging ────────────────────────────────────────────────────────
  logLevel: z
    .enum(["debug", "info", "warn", "error", "silent"])
    .default("info"),
  logFormat: z.enum(["text", "json"]).default("text"),

  // ─── AI Model ───────────────────────────────────────────────────────
  modelProvider: z.string().default("anthropic"),
  model: z.string().default("claude-sonnet-4-6"),

  // ─── Trigger Behavior ───────────────────────────────────────────────
  triggerPatterns: z.string().default("@Pi,Pi"),
  triggerMatch: z.string().default("mention"),

  // ─── Storage ────────────────────────────────────────────────────────
  authPath: z.string().optional(),

  // ─── Agent ───────────────────────────────────────────────────────────
  agentTimeoutMs: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(60 * 60 * 1000)
    .default(15 * 60 * 1000), // 15 minutes

  // ─── Rate Limiting ──────────────────────────────────────────────────
  rateLimitPerUser: z.coerce.number().int().min(1).max(1000).default(10),
  rateLimitWindowMs: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60 * 60 * 1000)
    .default(60 * 1000), // 1 minute

  // ─── Server ─────────────────────────────────────────────────────────
  port: z.coerce.number().int().min(1).max(65535).default(8787),
  botUsername: z.string().default("mercury"),

  // ─── Discord ────────────────────────────────────────────────────────
  enableDiscord: booleanFromEnv.default(false),
  discordGatewayDurationMs: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(60 * 60 * 1000)
    .default(10 * 60 * 1000),
  discordGatewaySecret: z.string().optional(),

  // ─── Slack ──────────────────────────────────────────────────────────
  enableSlack: booleanFromEnv.default(false),

  // ─── Teams ───────────────────────────────────────────────────────────
  enableTeams: booleanFromEnv.default(false),

  // ─── WhatsApp ───────────────────────────────────────────────────────
  enableWhatsApp: booleanFromEnv.default(false),

  // ─── WeCom (Enterprise WeChat) ──────────────────────────────────────
  enableWeCom: booleanFromEnv.default(false),

  // ─── Media Handling ─────────────────────────────────────────────────
  mediaEnabled: booleanFromEnv.default(true),
  mediaMaxSizeMb: z.coerce.number().min(1).max(100).default(10),

  // ─── Telemetry ──────────────────────────────────────────────────────
  otelEndpoint: z.string().optional(),
  otelService: z.string().default("mercury"),
});

export type AppConfig = z.infer<typeof schema> & {
  projectRoot: string;
  dbPath: string;
  workspacesDir: string;
  whatsappAuthDir: string;
};

export function loadConfig(): AppConfig {
  const base = schema.parse({
    // Logging
    logLevel: process.env.MERCURY_LOG_LEVEL,
    logFormat: process.env.MERCURY_LOG_FORMAT,

    // AI Model
    modelProvider: process.env.MERCURY_MODEL_PROVIDER,
    model: process.env.MERCURY_MODEL,

    // Trigger Behavior
    triggerPatterns: process.env.MERCURY_TRIGGER_PATTERNS,
    triggerMatch: process.env.MERCURY_TRIGGER_MATCH,

    // Storage
    authPath: process.env.MERCURY_AUTH_PATH,

    // Agent
    agentTimeoutMs: process.env.MERCURY_AGENT_TIMEOUT_MS,

    // Rate Limiting
    rateLimitPerUser: process.env.MERCURY_RATE_LIMIT_PER_USER,
    rateLimitWindowMs: process.env.MERCURY_RATE_LIMIT_WINDOW_MS,

    // Server
    port: process.env.MERCURY_PORT,
    botUsername: process.env.MERCURY_BOT_USERNAME,

    // Discord
    enableDiscord: process.env.MERCURY_ENABLE_DISCORD,
    discordGatewayDurationMs: process.env.MERCURY_DISCORD_GATEWAY_DURATION_MS,
    discordGatewaySecret: process.env.MERCURY_DISCORD_GATEWAY_SECRET,

    // Slack
    enableSlack: process.env.MERCURY_ENABLE_SLACK,

    // Teams
    enableTeams: process.env.MERCURY_ENABLE_TEAMS,

    // WhatsApp
    enableWhatsApp: process.env.MERCURY_ENABLE_WHATSAPP,

    // WeCom
    enableWeCom: process.env.MERCURY_ENABLE_WECOM,

    // Media Handling
    mediaEnabled: process.env.MERCURY_MEDIA_ENABLED,
    mediaMaxSizeMb: process.env.MERCURY_MEDIA_MAX_SIZE_MB,

    // Telemetry
    otelEndpoint: process.env.MERCURY_OTEL_ENDPOINT,
    otelService: process.env.MERCURY_OTEL_SERVICE,
  });

  const projectRoot = ".";

  return {
    ...base,
    projectRoot,
    dbPath: path.join(projectRoot, "state.db"),
    workspacesDir: path.join(projectRoot, "workspaces"),
    whatsappAuthDir:
      process.env.MERCURY_WHATSAPP_AUTH_DIR ??
      path.join(projectRoot, "whatsapp-auth"),
  };
}

export function resolveProjectPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.join(process.cwd(), p);
}

/** Fields that workspace .env can override on AppConfig */
export interface WorkspaceConfigOverrides {
  botUsername?: string;
  triggerPatterns?: string;
  triggerMatch?: string;
  modelProvider?: string;
  model?: string;
  agentTimeoutMs?: number;
  rateLimitPerUser?: number;
  rateLimitWindowMs?: number;
  /** Raw MERCURY_* env vars from workspace .env (for extension env passthrough) */
  env: Record<string, string>;
}

/**
 * Parse a .env file into key=value pairs.
 * Handles quotes, comments, and empty lines.
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, "utf8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

/**
 * Load workspace-specific config overrides from workspaces/<name>/.env.
 * Returns overrides for AppConfig fields + raw env vars for extension passthrough.
 */
export function loadWorkspaceConfig(
  workspaceDir: string,
): WorkspaceConfigOverrides {
  const envPath = path.join(workspaceDir, ".env");
  const raw = parseEnvFile(envPath);

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("MERCURY_")) {
      env[key] = value;
    }
  }

  const overrides: WorkspaceConfigOverrides = { env };

  if (raw.MERCURY_BOT_USERNAME)
    overrides.botUsername = raw.MERCURY_BOT_USERNAME;
  if (raw.MERCURY_TRIGGER_PATTERNS)
    overrides.triggerPatterns = raw.MERCURY_TRIGGER_PATTERNS;
  if (raw.MERCURY_TRIGGER_MATCH)
    overrides.triggerMatch = raw.MERCURY_TRIGGER_MATCH;
  if (raw.MERCURY_MODEL_PROVIDER)
    overrides.modelProvider = raw.MERCURY_MODEL_PROVIDER;
  if (raw.MERCURY_MODEL) overrides.model = raw.MERCURY_MODEL;
  if (raw.MERCURY_AGENT_TIMEOUT_MS) {
    const ms = Number.parseInt(raw.MERCURY_AGENT_TIMEOUT_MS, 10);
    if (!Number.isNaN(ms)) overrides.agentTimeoutMs = ms;
  }
  if (raw.MERCURY_RATE_LIMIT_PER_USER) {
    const n = Number.parseInt(raw.MERCURY_RATE_LIMIT_PER_USER, 10);
    if (!Number.isNaN(n)) overrides.rateLimitPerUser = n;
  }
  if (raw.MERCURY_RATE_LIMIT_WINDOW_MS) {
    const ms = Number.parseInt(raw.MERCURY_RATE_LIMIT_WINDOW_MS, 10);
    if (!Number.isNaN(ms)) overrides.rateLimitWindowMs = ms;
  }

  return overrides;
}

/**
 * Merge workspace overrides into a base AppConfig, returning a new config.
 * Non-overridable fields (port, adapters, logging, telemetry) are preserved from base.
 */
export function mergeWorkspaceConfig(
  base: AppConfig,
  overrides: WorkspaceConfigOverrides,
): AppConfig {
  return {
    ...base,
    ...(overrides.botUsername !== undefined && {
      botUsername: overrides.botUsername,
    }),
    ...(overrides.triggerPatterns !== undefined && {
      triggerPatterns: overrides.triggerPatterns,
    }),
    ...(overrides.triggerMatch !== undefined && {
      triggerMatch: overrides.triggerMatch,
    }),
    ...(overrides.modelProvider !== undefined && {
      modelProvider: overrides.modelProvider,
    }),
    ...(overrides.model !== undefined && { model: overrides.model }),
    ...(overrides.agentTimeoutMs !== undefined && {
      agentTimeoutMs: overrides.agentTimeoutMs,
    }),
    ...(overrides.rateLimitPerUser !== undefined && {
      rateLimitPerUser: overrides.rateLimitPerUser,
    }),
    ...(overrides.rateLimitWindowMs !== undefined && {
      rateLimitWindowMs: overrides.rateLimitWindowMs,
    }),
  };
}
