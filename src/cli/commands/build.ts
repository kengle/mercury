import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CWD, getImageTag, getVersion, PACKAGE_ROOT, TEMPLATES_DIR } from "../helpers.js";
import type { ExtensionMeta } from "../../extensions/types.js";

async function loadExtensions(): Promise<ExtensionMeta[]> {
  const extensionsDir = join(CWD, "extensions");
  if (!existsSync(extensionsDir)) return [];

  const { ExtensionRegistry } = await import("../../extensions/loader.js");
  const { createDatabase } = await import("../../core/db.js");
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

  return registry.list();
}

async function generateDockerfileContent(extensions: ExtensionMeta[], mercuryVersion: string, options?: { localSource?: string; isLocalBuild?: boolean }): Promise<string> {
  const baseDockerfile = join(PACKAGE_ROOT, "container/Dockerfile");
  let content = readFileSync(baseDockerfile, "utf8");

  if (extensions.some((e) => e.clis.length > 0)) {
    const { injectExtensionInstalls } = await import("../../extensions/image-builder.js");
    content = injectExtensionInstalls(content, extensions);
  }

  content = content.replace(
    /^ARG MERCURY_VERSION=.*$/m,
    `ARG MERCURY_VERSION=${mercuryVersion}`,
  );

  // 支持本地路径或自定义安装命令
  if (options?.localSource && options?.isLocalBuild) {
    // 本地构建模式：从构建上下文安装
    content = content.replace(
      /^ARG MERCURY_INSTALL="bun add -g mercury-ai@\$\{MERCURY_VERSION\}"/m,
      `ARG MERCURY_INSTALL="bun add -g /mercury-source"`,
    );
    // 添加 COPY 指令将本地源码复制到镜像中
    content = content.replace(
      /^# Mercury$/m,
      `# Mercury (local source)\nCOPY mercury-source /mercury-source`,
    );
  } else if (options?.localSource) {
    // 仅生成 Dockerfile 模式：使用 file: 协议（用户需要自己处理构建上下文）
    content = content.replace(
      /^ARG MERCURY_INSTALL="bun add -g mercury-ai@\$\{MERCURY_VERSION\}"/m,
      `ARG MERCURY_INSTALL="bun add -g mercury-ai@file:${options.localSource}"`,
    );
  }

  return content;
}

function generateEnvExample(extensions: ExtensionMeta[]): string {
  const base = readFileSync(join(TEMPLATES_DIR, "env.template"), "utf8");

  const extEnvVars = extensions.flatMap((ext) =>
    ext.envVars.map((env) => ({ ext: ext.name, ...env })),
  );

  if (extEnvVars.length === 0) return base;

  const lines = [base.trimEnd(), "", "# ─── Extensions ────────────────────────────────────────────────────────"];
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

export async function dockerfileAction(options: { version?: string; localSource?: string; isLocalBuild?: boolean }): Promise<void> {
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

  const dockerfileContent = await generateDockerfileContent(extensions, mercuryVersion, { localSource: options.localSource, isLocalBuild: options.isLocalBuild });
  writeFileSync(join(CWD, "Dockerfile"), dockerfileContent);
  
  if (options.localSource) {
    if (options.isLocalBuild) {
      console.log(`✓ Generated Dockerfile (mercury-ai from local source)`);
    } else {
      console.log(`✓ Generated Dockerfile (mercury-ai@file:${options.localSource})`);
    }
  } else {
    console.log(`✓ Generated Dockerfile (mercury-ai@${mercuryVersion})`);
  }

  const envContent = generateEnvExample(extensions);
  writeFileSync(join(CWD, ".env.example"), envContent);
  console.log("✓ Generated .env.example");
}

export async function buildAction(options: { version?: string; localSource?: string }): Promise<void> {
  const envPath = join(CWD, ".env");
  const tag = getImageTag(envPath);
  const isLocalBuild = !!options.localSource;

  // 如果是本地构建，需要复制源码到构建上下文
  let cleanupFn: (() => void) | undefined;
  
  if (isLocalBuild && options.localSource) {
    const mercurySourceDir = join(CWD, "mercury-source");
    
    // 清理旧的源码目录
    if (existsSync(mercurySourceDir)) {
      rmSync(mercurySourceDir, { recursive: true, force: true });
    }
    
    // 创建新目录并复制源码
    mkdirSync(mercurySourceDir, { recursive: true });
    console.log(`📦 Copying Mercury source from ${options.localSource}...`);
    
    // 使用 rsync 或 cp 复制文件（排除 .git 和其他不必要的文件）
    const srcPath = options.localSource.endsWith("/") ? options.localSource : `${options.localSource}/`;
    const result = spawnSync("rsync", [
      "-av",
      "--delete",
      "--exclude", ".git",
      "--exclude", ".gitignore",
      "--exclude", ".gitmodules",
      "--exclude", "node_modules",
      "--exclude", "dist",
      "--exclude", ".DS_Store",
      srcPath,
      mercurySourceDir,
    ], {
      stdio: "inherit",
      timeout: 120_000,
    });
    
    if (result.status !== 0) {
      console.error("rsync failed, trying cp...");
      // rsync 失败，尝试用 cp（cp 无法排除，后续由 .dockerignore 处理）
      const cpResult = spawnSync("cp", ["-R", srcPath, mercurySourceDir], {
        stdio: "inherit",
        timeout: 120_000,
      });
      if (cpResult.status !== 0) {
        console.error("Failed to copy Mercury source");
        process.exit(1);
      }
    }
    
    console.log(`✓ Copied Mercury source to ${mercurySourceDir}`);
    
    // 清理函数
    cleanupFn = () => {
      if (existsSync(mercurySourceDir)) {
        rmSync(mercurySourceDir, { recursive: true, force: true });
      }
    };
  }

  await dockerfileAction({ ...options, isLocalBuild });

  console.log(`\n📦 Building ${tag}...\n`);
  const result = spawnSync(
    "docker",
    ["build", "-t", tag, "."],
    { stdio: "inherit", cwd: CWD, timeout: 600_000 },
  );

  // 清理临时源码目录
  if (cleanupFn) {
    cleanupFn();
    console.log(`✓ Cleaned up temporary source directory`);
  }

  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`\n✓ Built ${tag}`);
}
