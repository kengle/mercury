import fs from "node:fs";
import path from "node:path";

const PI_SUBDIRS = [".pi", ".pi/extensions", ".pi/skills", ".pi/prompts"];

export function ensurePiResourceDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const sub of PI_SUBDIRS) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }

  const agentsPath = path.join(dir, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, "", "utf8");
  }
}
