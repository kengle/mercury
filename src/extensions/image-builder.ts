/**
 * Derived image builder.
 *
 * When extensions declare CLI tools via `mercury.cli()`, this module
 * generates a Dockerfile extending the base agent image with those
 * CLIs installed, builds it, and caches the result by content hash.
 *
 * Install commands are grouped by package manager (apt, pip, npm, bun)
 * into minimal RUN steps with BuildKit cache mounts for fast rebuilds.
 */

import type { ExtensionMeta } from "./types.js";

/** Parsed install command — either a known package manager or raw shell. */
export type ParsedInstall =
  | { type: "apt"; packages: string[] }
  | { type: "pip"; packages: string[] }
  | { type: "npm"; packages: string[] }
  | { type: "bun"; packages: string[] }
  | { type: "shell"; command: string };

/**
 * Split a command string on `&&` while respecting single and double quotes.
 * `&&` inside quoted strings is not treated as a separator.
 */
function splitOnAnd(cmd: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
    } else if (ch === "&" && cmd[i + 1] === "&" && !inSingle && !inDouble) {
      parts.push(current.trim());
      current = "";
      i++; // skip second &
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) parts.push(last);

  return parts;
}

/**
 * Parse a single install command string into a typed representation.
 * Recognizes apt-get, pip, npm, and bun patterns. Falls back to shell.
 */
export function parseInstallCommand(cmd: string): ParsedInstall[] {
  const results: ParsedInstall[] = [];

  // Split on && respecting quotes
  const parts = splitOnAnd(cmd);

  // If the command mixes apt/pip/npm/bun with shell commands (e.g. repo setup
  // via curl/echo before apt-get install), keep the whole thing as a single
  // shell command to preserve ordering dependencies.
  const hasShellParts = parts.some(
    (p) =>
      p &&
      !p.match(/^apt-get\s/) &&
      !p.match(/^(?:python3\s+-m\s+)?pip\s+install/) &&
      !p.match(/^npm\s+install\s+-g/) &&
      !p.match(/^bun\s+add\s+-g/) &&
      !p.match(/^rm\s+-rf\s+\/var\/lib\/apt/),
  );
  const hasPackageManager = parts.some(
    (p) =>
      p &&
      (p.match(/^apt-get\s+install/) ||
        p.match(/^(?:python3\s+-m\s+)?pip\s+install/) ||
        p.match(/^npm\s+install\s+-g/) ||
        p.match(/^bun\s+add\s+-g/)),
  );
  if (hasShellParts && hasPackageManager) {
    return [{ type: "shell", command: cmd }];
  }

  for (const part of parts) {
    // apt-get install
    const aptMatch = part.match(
      /^apt-get\s+(?:update\s*$|install\s+(?:-\S+\s+)*(.+))/,
    );
    if (aptMatch) {
      if (aptMatch[1]) {
        // Extract package names (skip flags like -y --no-install-recommends)
        const packages = aptMatch[1]
          .split(/\s+/)
          .filter((s) => s && !s.startsWith("-"));
        if (packages.length > 0) {
          results.push({ type: "apt", packages });
        }
      }
      // Skip bare "apt-get update" and "rm -rf /var/lib/apt/lists/*"
      continue;
    }

    // rm -rf /var/lib/apt/lists/* (apt cleanup, skip)
    if (/^rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(part)) {
      continue;
    }

    // pip install
    const pipMatch = part.match(
      /^(?:python3\s+-m\s+)?pip\s+install\s+(?:-\S+\s+)*(.+)/,
    );
    if (pipMatch) {
      const packages = pipMatch[1]
        .split(/\s+/)
        .filter((s) => s && !s.startsWith("-"));
      if (packages.length > 0) {
        results.push({ type: "pip", packages });
      }
      continue;
    }

    // npm install -g
    const npmMatch = part.match(/^npm\s+install\s+-g\s+(.+)/);
    if (npmMatch) {
      const packages = npmMatch[1]
        .split(/\s+/)
        .filter((s) => s && !s.startsWith("-"));
      if (packages.length > 0) {
        results.push({ type: "npm", packages });
      }
      continue;
    }

    // bun add -g
    const bunMatch = part.match(/^bun\s+add\s+-g\s+(.+)/);
    if (bunMatch) {
      const packages = bunMatch[1]
        .split(/\s+/)
        .filter((s) => s && !s.startsWith("-"));
      if (packages.length > 0) {
        results.push({ type: "bun", packages });
      }
      continue;
    }

    // Everything else is a shell command
    if (part) {
      results.push({ type: "shell", command: part });
    }
  }

  return results;
}

/**
 * Merge parsed install commands: group packages by manager, deduplicate.
 * Shell commands are preserved in order.
 */
export function mergeInstalls(parsed: ParsedInstall[]): ParsedInstall[] {
  const apt = new Set<string>();
  const pip = new Set<string>();
  const npm = new Set<string>();
  const bun = new Set<string>();
  const shell: string[] = [];
  const shellSeen = new Set<string>();

  for (const p of parsed) {
    if (p.type === "shell") {
      if (!shellSeen.has(p.command)) {
        shellSeen.add(p.command);
        shell.push(p.command);
      }
    } else {
      const set =
        p.type === "apt"
          ? apt
          : p.type === "pip"
            ? pip
            : p.type === "npm"
              ? npm
              : bun;
      for (const pkg of p.packages) set.add(pkg);
    }
  }

  const result: ParsedInstall[] = [];
  if (apt.size > 0) result.push({ type: "apt", packages: [...apt].sort() });
  if (pip.size > 0) result.push({ type: "pip", packages: [...pip].sort() });
  if (npm.size > 0) result.push({ type: "npm", packages: [...npm].sort() });
  if (bun.size > 0) result.push({ type: "bun", packages: [...bun].sort() });
  for (const cmd of shell) result.push({ type: "shell", command: cmd });

  return result;
}

/**
 * Convert merged installs into RUN lines with BuildKit cache mounts.
 */
export function toRunStatements(merged: ParsedInstall[]): string[] {
  const lines: string[] = [];

  for (const m of merged) {
    switch (m.type) {
      case "apt":
        lines.push(
          `RUN apt-get update && apt-get install -y --no-install-recommends ${m.packages.join(" ")} && ` +
            `rm -rf /var/lib/apt/lists/*`,
        );
        break;
      case "pip":
        lines.push(
          `RUN --mount=type=cache,target=/root/.cache/pip ` +
            `pip install --break-system-packages ${m.packages.join(" ")}`,
        );
        break;
      case "npm":
        lines.push(
          `RUN --mount=type=cache,target=/root/.npm ` +
            `PUPPETEER_SKIP_DOWNLOAD=true npm install -g ${m.packages.join(" ")}`,
        );
        break;
      case "bun":
        lines.push(
          `RUN --mount=type=cache,target=/root/.bun/install/cache ` +
            `bun add -g ${m.packages.join(" ")}`,
        );
        break;
      case "shell":
        lines.push(`RUN ${m.command}`);
        break;
    }
  }

  return lines;
}

/**
 * Inject extension CLI install lines into a base Dockerfile.
 * Inserts RUN statements before the ENTRYPOINT line.
 * Returns the original content unchanged if no extensions declare CLIs.
 */
export function injectExtensionInstalls(
  baseDockerfile: string,
  extensions: ExtensionMeta[],
): string {
  const allClis = extensions.flatMap((e) => e.clis);
  if (allClis.length === 0) return baseDockerfile;

  const parsed = allClis.flatMap((cli) => parseInstallCommand(cli.install));
  const merged = mergeInstalls(parsed);
  const runLines = toRunStatements(merged);

  if (runLines.length === 0) return baseDockerfile;

  const lines = baseDockerfile.split("\n");
  const entrypointIdx = lines.findIndex((l) => /^\s*ENTRYPOINT\s/i.test(l));

  const insertIdx = entrypointIdx >= 0 ? entrypointIdx : lines.length;
  const header = `\n# Extension CLIs`;
  lines.splice(insertIdx, 0, header, ...runLines, "");

  return lines.join("\n");
}
