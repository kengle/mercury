import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CWD, getImageTag, getVersion, PACKAGE_ROOT } from "../helpers.js";

async function generateDockerfile(mercuryVersion: string): Promise<string> {
  const baseDockerfile = join(PACKAGE_ROOT, "container/Dockerfile");
  let content = readFileSync(baseDockerfile, "utf8");

  const extensionsDir = join(CWD, "extensions");
  if (existsSync(extensionsDir)) {
    const { ExtensionRegistry } = await import("../../extensions/loader.js");
    const { createDatabase } = await import("../../core/db.js");
    const { injectExtensionInstalls } = await import("../../extensions/image-builder.js");
    const { createExtensionStateService } = await import("../../extensions/state-service.js");
    const { createRoleService } = await import("../../services/roles/service.js");
    const { createConfigService } = await import("../../services/config/service.js");

    const tmpDbPath = join(CWD, "build-tmp.db");
    const db = createDatabase(tmpDbPath);
    const configSvc = createConfigService(db);
    const rolesSvc = createRoleService(db, configSvc);
    const extState = createExtensionStateService(db);
    const registry = new ExtensionRegistry();
    await registry.loadAll(extensionsDir, extState, rolesSvc, console as any);
    db.close();
    try { unlinkSync(tmpDbPath); } catch {}

    const extensions = registry.list();
    if (extensions.some((e) => e.clis.length > 0)) {
      const cliCount = extensions.reduce((n, e) => n + e.clis.length, 0);
      console.log(`Found ${cliCount} extension CLI(s):`);
      for (const ext of extensions) {
        for (const cli of ext.clis) {
          console.log(`  ${ext.name}: ${cli.install}`);
        }
      }
      content = injectExtensionInstalls(content, extensions);
    }
  }

  content = content.replace(
    /^ARG MERCURY_VERSION=.*$/m,
    `ARG MERCURY_VERSION=${mercuryVersion}`,
  );

  return content;
}

export async function dockerfileAction(options: { version?: string }): Promise<void> {
  const mercuryVersion = options.version ?? getVersion();
  const content = await generateDockerfile(mercuryVersion);
  const dockerfilePath = join(CWD, "Dockerfile");
  writeFileSync(dockerfilePath, content);
  console.log(`✓ Generated Dockerfile (mercury-ai@${mercuryVersion})`);
}

export async function buildAction(options: { version?: string }): Promise<void> {
  const envPath = join(CWD, ".env");
  const tag = getImageTag(envPath);
  const mercuryVersion = options.version ?? getVersion();

  await dockerfileAction(options);

  console.log(`\n📦 Building ${tag}...\n`);
  const result = spawnSync(
    "docker",
    ["build", "-t", tag, "."],
    { stdio: "inherit", cwd: CWD, timeout: 600_000 },
  );

  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`\n✓ Built ${tag}`);
}
