import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { RESERVED_EXTENSION_NAMES } from "../../extensions/reserved.js";
import { CWD, getUserExtensionsDir, VALID_EXT_NAME_RE } from "../helpers.js";

function resolveExtensionSource(source: string): {
  dir: string;
  name: string;
  cleanup: () => void;
} {
  if (source.startsWith("npm:")) {
    const pkg = source.slice(4);
    const maybeName = pkg.includes("/") ? pkg.split("/").pop() : pkg;
    const name = maybeName || pkg;
    const tmp = join(tmpdir(), `mercury-ext-npm-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });

    console.log(`Fetching ${pkg} from npm...`);
    const packResult = spawnSync(
      "npm",
      ["pack", pkg, "--pack-destination", tmp],
      { stdio: ["pipe", "pipe", "pipe"], cwd: tmp },
    );
    if (packResult.status !== 0) {
      rmSync(tmp, { recursive: true, force: true });
      console.error(`Error: failed to fetch npm package "${pkg}"`);
      console.error(packResult.stderr?.toString().trim());
      process.exit(1);
    }

    const tarballs = readdirSync(tmp).filter((f) => f.endsWith(".tgz"));
    if (tarballs.length === 0) {
      rmSync(tmp, { recursive: true, force: true });
      console.error(`Error: npm pack produced no tarball`);
      process.exit(1);
    }

    const extractDir = join(tmp, "extracted");
    mkdirSync(extractDir, { recursive: true });
    const extractResult = spawnSync(
      "tar",
      ["xzf", join(tmp, tarballs[0]), "-C", extractDir, "--strip-components=1"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    if (extractResult.status !== 0) {
      rmSync(tmp, { recursive: true, force: true });
      console.error(`Error: failed to extract tarball`);
      process.exit(1);
    }

    return {
      dir: extractDir,
      name,
      cleanup: () => rmSync(tmp, { recursive: true, force: true }),
    };
  }

  if (source.startsWith("git:")) {
    const raw = source.slice(4);
    const hashIdx = raw.indexOf("#");
    const urlPart = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
    const subdir = hashIdx >= 0 ? raw.slice(hashIdx + 1) : undefined;
    const gitUrl = urlPart.startsWith("http") ? urlPart : `https://${urlPart}`;
    const tmp = join(tmpdir(), `mercury-ext-git-${Date.now()}`);

    console.log(`Cloning ${gitUrl}...`);
    const cloneResult = spawnSync(
      "git",
      ["clone", "--depth", "1", gitUrl, tmp],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    if (cloneResult.status !== 0) {
      rmSync(tmp, { recursive: true, force: true });
      console.error(`Error: failed to clone "${gitUrl}"`);
      console.error(cloneResult.stderr?.toString().trim());
      process.exit(1);
    }

    const extDir = subdir ? join(tmp, subdir) : tmp;
    if (subdir && !existsSync(extDir)) {
      rmSync(tmp, { recursive: true, force: true });
      console.error(`Error: subdirectory "${subdir}" not found`);
      process.exit(1);
    }

    return {
      dir: extDir,
      name: basename(extDir),
      cleanup: () => rmSync(tmp, { recursive: true, force: true }),
    };
  }

  const absPath = resolve(CWD, source);
  if (!existsSync(absPath)) {
    console.error(`Error: path not found: ${source}`);
    process.exit(1);
  }
  if (!existsSync(join(absPath, "index.ts"))) {
    console.error(`Error: no index.ts found in ${source}`);
    process.exit(1);
  }
  return { dir: absPath, name: basename(absPath), cleanup: () => {} };
}

function validateExtension(
  name: string,
  sourceDir: string,
  extensionsDir: string,
): void {
  if (!VALID_EXT_NAME_RE.test(name)) {
    console.error(`Error: invalid extension name "${name}"`);
    process.exit(1);
  }
  if (RESERVED_EXTENSION_NAMES.has(name)) {
    console.error(`Error: "${name}" is a reserved name`);
    process.exit(1);
  }
  if (!existsSync(join(sourceDir, "index.ts"))) {
    console.error("Error: no index.ts found");
    process.exit(1);
  }
  if (existsSync(join(extensionsDir, name))) {
    console.error(
      `Error: "${name}" already installed. Run 'mercury ext remove ${name}' first.`,
    );
    process.exit(1);
  }
}

async function dryRunExtension(dir: string, name: string): Promise<void> {
  const indexPath = join(dir, "index.ts");
  try {
    const mod = await import(indexPath);
    if (typeof mod.default !== "function") {
      console.error(`Error: ${name}/index.ts must export a default function`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: failed to load ${name}/index.ts:`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function hasSkillDir(extDir: string): boolean {
  return existsSync(join(extDir, "skill", "SKILL.md"));
}

async function readExtensionInfo(dir: string): Promise<{
  hasCli: boolean;
  hasSkill: boolean;
  cliNames: string[];
  permissionRoles?: string[];
}> {
  const { MercuryExtensionAPIImpl } = await import("../../extensions/api.js");
  const { createDatabase } = await import("../../core/db.js");
  const { createExtensionStateService } = await import(
    "../../extensions/state-service.js"
  );

  const tmpDbPath = join(tmpdir(), `mercury-dryrun-${Date.now()}.db`);
  const db = createDatabase(tmpDbPath);
  try {
    const name = basename(dir);
    const extState = createExtensionStateService(db);
    const api = new MercuryExtensionAPIImpl(name, dir, extState, () => {});
    const mod = await import(join(dir, "index.ts"));
    try {
      mod.default(api);
    } catch {}
    const meta = api.getMeta();
    return {
      hasCli: meta.clis.length > 0,
      hasSkill: !!meta.skillDir,
      cliNames: meta.clis.map((c) => c.name),
      permissionRoles: meta.permission?.defaultRoles,
    };
  } finally {
    db.close();
    rmSync(tmpDbPath, { force: true });
  }
}

export async function addAction(source: string): Promise<void> {
  const extensionsDir = getUserExtensionsDir();
  mkdirSync(extensionsDir, { recursive: true });

  const { dir: sourceDir, name, cleanup } = resolveExtensionSource(source);

  try {
    validateExtension(name, sourceDir, extensionsDir);
    await dryRunExtension(sourceDir, name);

    const destDir = join(extensionsDir, name);
    cpSync(sourceDir, destDir, { recursive: true });

    const hasSkill = hasSkillDir(destDir);

    let info: Awaited<ReturnType<typeof readExtensionInfo>>;
    try {
      info = await readExtensionInfo(destDir);
    } catch {
      info = { hasCli: false, hasSkill: hasSkill, cliNames: [] };
    }

    console.log(`\n✓ Extension "${name}" installed`);
    if (info.hasCli)
      console.log(
        `  CLI: ${info.cliNames.join(", ")} (available after build)`,
      );
    if (hasSkill) console.log(`  Skill: ${name} (available to agent)`);
    if (info.permissionRoles)
      console.log(
        `  Permission: ${name} (default: ${info.permissionRoles.join(", ")})`,
      );
    if (info.hasCli) {
      console.log("\nBuild the agent image to activate:");
      console.log("  mercury build");
    }
  } catch (err) {
    const destDir = join(extensionsDir, name);
    if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
    throw err;
  } finally {
    cleanup();
  }
}

export function removeAction(name: string): void {
  const extensionsDir = getUserExtensionsDir();
  const extDir = join(extensionsDir, name);

  if (!existsSync(extDir)) {
    console.error(`Error: extension "${name}" is not installed`);
    process.exit(1);
  }

  rmSync(extDir, { recursive: true });

  console.log(`✓ Extension "${name}" removed`);
  console.log("\nmercury build:");
  console.log("  mercury restart");
}

export function extensionsListAction(): void {
  const userExtDir = getUserExtensionsDir();

  const extensions: Array<{
    name: string;
    features: string[];
    description: string;
  }> = [];

  if (existsSync(userExtDir)) {
    for (const entry of readdirSync(userExtDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (!VALID_EXT_NAME_RE.test(name)) continue;
      if (RESERVED_EXTENSION_NAMES.has(name)) continue;

      const extDir = join(userExtDir, name);
      if (!existsSync(join(extDir, "index.ts"))) continue;

      const features: string[] = [];
      if (existsSync(join(extDir, "skill", "SKILL.md"))) features.push("Skill");

      let description = "";
      const skillMd = join(extDir, "skill", "SKILL.md");
      if (existsSync(skillMd)) {
        const content = readFileSync(skillMd, "utf-8");
        const descMatch = content.match(
          /^description:\s*(.+?)(?:\n[a-z]|\n---)/ms,
        );
        if (descMatch) description = descMatch[1].replace(/\n\s*/g, " ").trim();
      }

      extensions.push({ name, features, description });
    }
  }

  if (extensions.length === 0) {
    console.log("No extensions installed.");
    console.log("\nInstall one with:");
    console.log("  mercury ext add ./path/to/extension");
    console.log("  mercury ext add npm:<package>");
    console.log("  mercury ext add git:<repo-url>");
    return;
  }

  extensions.sort((a, b) => a.name.localeCompare(b.name));

  const nameWidth = Math.max(12, ...extensions.map((e) => e.name.length));
  const featWidth = Math.max(
    10,
    ...extensions.map((e) => e.features.join(" + ").length || 3),
  );

  for (const ext of extensions) {
    const features = ext.features.length > 0 ? ext.features.join(" + ") : "—";
    const desc = ext.description
      ? `  ${ext.description.slice(0, 60)}${ext.description.length > 60 ? "…" : ""}`
      : "";
    console.log(
      `${ext.name.padEnd(nameWidth)}  ${features.padEnd(featWidth)}${desc}`,
    );
  }
}
