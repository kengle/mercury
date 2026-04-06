import fs from "node:fs";
import path from "node:path";

const PI_SUBDIRS = [".pi", ".pi/extensions", ".pi/skills", ".pi/prompts"];

/**
 * Ensure pi agent resource directory structure.
 * 
 * Creates empty AGENTS.md if it doesn't exist — this allows pi to inherit
 * configuration from parent directories (e.g., workspaces/AGENTS.md).
 * 
 * Directory hierarchy:
 * - workspaces/AGENTS.md         → Agent-wide capabilities and constraints
 * - workspaces/<name>/AGENTS.md  → Workspace-specific overrides (optional)
 */
export function ensurePiResourceDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const sub of PI_SUBDIRS) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }

  const agentsPath = path.join(dir, "AGENTS.md");
  
  // Create empty file if not exists — pi will search parent directories
  // for AGENTS.md and inherit configuration from workspaces/AGENTS.md
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, "", "utf8");
  }
}
