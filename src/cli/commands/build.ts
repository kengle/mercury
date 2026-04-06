import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ExtensionMeta } from "../../extensions/types.js";
import { CWD, getImageTag } from "../helpers.js";

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

async function generateDockerfileContent(extensions: ExtensionMeta[]): Promise<string> {
  const dockerfileBasePath = join(CWD, "Dockerfile.base");
  let content = readFileSync(dockerfileBasePath, "utf8");

  if (extensions.some((e) => e.clis.length > 0)) {
    const { injectExtensionInstalls } = await import(
      "../../extensions/image-builder.js"
    );
    content = injectExtensionInstalls(content, extensions);
  }

  return content;
}

function generateEnvExample(extensions: ExtensionMeta[]): string {
  const mercurySrc = findMercurySrc();
  const base = readFileSync(join(mercurySrc, "resources/templates/env.template"), "utf8");

  const extEnvVars = extensions.flatMap((ext) =>
    ext.envVars.map((env) => ({ ext: ext.name, ...env }))
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

export async function buildAction(): Promise<void> {
  const envPath = join(CWD, ".env");
  const tag = getImageTag(envPath);

  // Check if Dockerfile.base exists
  const dockerfileBasePath = join(CWD, "Dockerfile.base");
  if (!existsSync(dockerfileBasePath)) {
    console.error(`❌ Error: Dockerfile.base not found.`);
    console.error("   Run 'mercury init' first to create it.");
    process.exit(1);
  }

  // Check if any running container is using this image tag
  const checkRunning = spawnSync("docker", ["ps", "--format", "{{.Image}}"]);
  if (checkRunning.status === 0) {
    const runningImages = checkRunning.stdout.toString().split("\n").filter(Boolean);
    const isRunning = runningImages.some(img => {
      return img === tag || img.endsWith(`:${tag.split(":").pop()}`);
    });
    
    if (isRunning) {
      console.error(`❌ Error: Image "${tag}" is currently in use by a running container.`);
      console.error("   Stop the container first: mercury stop");
      console.error("   Or use a different tag in .env: MERCURY_IMAGE=mercury:v2");
      process.exit(1);
    }
  }

  // Load extensions and generate Dockerfile
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

  // Generate Dockerfile from Dockerfile.base
  const dockerfileContent = await generateDockerfileContent(extensions);
  const dockerfilePath = join(CWD, "Dockerfile");
  writeFileSync(dockerfilePath, dockerfileContent);
  console.log(`✓ Generated Dockerfile`);

  console.log(`\n📦 Building ${tag}...\n`);
  const buildResult = spawnSync(
    "docker",
    ["build", "-t", tag, "."],
    { stdio: "inherit", cwd: CWD, timeout: 600_000 }
  );

  // Clean up Dockerfile after build
  if (existsSync(dockerfilePath)) {
    rmSync(dockerfilePath);
    console.log(`✓ Cleaned up Dockerfile`);
  }

  // Clean up temporary source directory
  if (existsSync(mercurySourceDir)) {
    rmSync(mercurySourceDir, { recursive: true, force: true });
    console.log(`✓ Cleaned up temporary source directory`);
  }

  if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
  console.log(`\n✓ Built ${tag}`);
}
