import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionMeta } from "../../extensions/types.js";
import {
  CWD,
  getImageTag,
  getVersion,
  PACKAGE_ROOT,
  TEMPLATES_DIR,
} from "../helpers.js";

async function loadExtensions(): Promise<ExtensionMeta[]> {
  const extensionsDir = join(CWD, "extensions");
  if (!existsSync(extensionsDir)) return [];

  const { ExtensionRegistry } = await import("../../extensions/loader.js");
  const { createDatabase } = await import("../../core/db.js");
  const { createExtensionStateService } = await import(
    "../../extensions/state-service.js"
  );
  const { createRoleService } = await import("../../services/roles/service.js");
  const { createConfigService } = await import(
    "../../services/config/service.js"
  );

  const tmpDbPath = join(CWD, "build-tmp.db");
  const db = createDatabase(tmpDbPath);
  const configSvc = createConfigService(db);
  const rolesSvc = createRoleService(db, configSvc);
  const extState = createExtensionStateService(db);
  const registry = new ExtensionRegistry();
  await registry.loadAll(extensionsDir, extState, rolesSvc, console as any);
  db.close();
  try {
    unlinkSync(tmpDbPath);
  } catch {}

  return registry.list();
}

async function generateDockerfileContent(
  extensions: ExtensionMeta[],
  mercuryVersion: string,
): Promise<string> {
  const baseDockerfile = join(PACKAGE_ROOT, "container/Dockerfile");
  let content = readFileSync(baseDockerfile, "utf8");

  if (extensions.some((e) => e.clis.length > 0)) {
    const { injectExtensionInstalls } = await import(
      "../../extensions/image-builder.js"
    );
    content = injectExtensionInstalls(content, extensions);
  }

  content = content.replace(
    /^ARG MERCURY_VERSION=.*$/m,
    `ARG MERCURY_VERSION=${mercuryVersion}`,
  );

  return content;
}

function generateEnvExample(extensions: ExtensionMeta[]): string {
  const base = readFileSync(join(TEMPLATES_DIR, "env.template"), "utf8");

  const extEnvVars = extensions.flatMap((ext) =>
    ext.envVars.map((env) => ({ ext: ext.name, ...env })),
  );

  if (extEnvVars.length === 0) return base;

  const lines = [
    base.trimEnd(),
    "",
    "# ─── Extensions ────────────────────────────────────────────────────────",
  ];
  let currentExt = "";
  for (const v of extEnvVars) {
    if (v.ext !== currentExt) {
      currentExt = v.ext;
      lines.push(`# ${v.ext}`);
    }
    lines.push(`# ${v.from}=`);
  }
  lines.push("");

  return lines.join("\n");
}

export async function dockerfileAction(options: {
  version?: string;
}): Promise<void> {
  const mercuryVersion = options.version ?? getVersion();
  const extensions = await loadExtensions();

  const cliCount = extensions.reduce((n, e) => n + e.clis.length, 0);
  if (cliCount > 0) {
    console.log(`Found ${cliCount} extension CLI(s):`);
    for (const ext of extensions) {
      for (const cli of ext.clis) {
        console.log(`  ${ext.name}: ${cli.install}`);
      }
    }
  }

  const dockerfileContent = await generateDockerfileContent(
    extensions,
    mercuryVersion,
  );
  writeFileSync(join(CWD, "Dockerfile"), dockerfileContent);
  console.log(`✓ Generated Dockerfile (mercury-ai@${mercuryVersion})`);

  const envContent = generateEnvExample(extensions);
  writeFileSync(join(CWD, ".env.example"), envContent);
  console.log("✓ Generated .env.example");
}

export async function buildAction(options: {
  version?: string;
}): Promise<void> {
  const envPath = join(CWD, ".env");
  const tag = getImageTag(envPath);

  await dockerfileAction(options);

  console.log(`\n📦 Building ${tag}...\n`);
  const result = spawnSync("docker", ["build", "-t", tag, "."], {
    stdio: "inherit",
    cwd: CWD,
    timeout: 600_000,
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`\n✓ Built ${tag}`);
}
