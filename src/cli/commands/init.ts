import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createDatabase } from "../../core/db.js";
import { createApiKeyService } from "../../services/api-keys/service.js";
import { CWD, findMercurySrc, PACKAGE_ROOT, TEMPLATES_DIR } from "../helpers.js";

const GITIGNORE = `.env
state.db
state.db-shm
state.db-wal
pi-agent/
workspaces/
extensions/*/dist/
extensions/*/node_modules/
.build-context/
build-tmp.db
build-tmp.db-shm
build-tmp.db-wal
Dockerfile
`;

export function initAction(): void {
  console.log("🪽 Initializing mercury project...\n");

  const envPath = join(CWD, ".env");
  if (!existsSync(envPath)) {
    copyFileSync(join(TEMPLATES_DIR, "env.template"), envPath);
    console.log("  ✓ .env");
  } else {
    console.log("  • .env (already exists)");
  }

  // Copy Dockerfile.base from templates
  const dockerfileBasePath = join(CWD, "Dockerfile.base");
  if (!existsSync(dockerfileBasePath)) {
    copyFileSync(join(TEMPLATES_DIR, "Dockerfile.base"), dockerfileBasePath);
    console.log("  ✓ Dockerfile.base");
  } else {
    console.log("  • Dockerfile.base (already exists)");
  }

  const wsRoot = join(CWD, "workspaces");
  mkdirSync(wsRoot, { recursive: true });
  console.log("  ✓ workspaces/");

  // Copy AGENTS.md template to workspaces/ directory
  // This defines the agent's core capabilities and constraints for all workspaces
  const workspaceAgentsPath = join(wsRoot, "AGENTS.md");
  if (!existsSync(workspaceAgentsPath)) {
    copyFileSync(join(TEMPLATES_DIR, "AGENTS.md"), workspaceAgentsPath);
    console.log("  ✓ workspaces/AGENTS.md");
  } else {
    console.log("  • workspaces/AGENTS.md (already exists)");
  }

  // Copy models.json from templates
  const modelsJsonPath = join(CWD, "models.json");
  if (!existsSync(modelsJsonPath)) {
    copyFileSync(join(TEMPLATES_DIR, "models.json"), modelsJsonPath);
    console.log("  ✓ models.json");
  } else {
    console.log("  • models.json (already exists)");
  }

  const gitignorePath = join(CWD, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE);
    console.log("  ✓ .gitignore");
  } else {
    console.log("  • .gitignore (already exists)");
  }

  // Generate first API key and save to .env
  const dbPath = join(CWD, "state.db");
  const db = createDatabase(dbPath);
  const apiKeys = createApiKeyService(db);
  const existing = apiKeys.list();
  if (existing.length === 0) {
    const { key } = apiKeys.create("default");
    
    // Save to .env file
    const envPath = join(CWD, ".env");
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, "utf8");
      if (!envContent.includes("MERCURY_API_KEY=")) {
        const newContent = `${envContent}\n# API Key for internal service communication\nMERCURY_API_KEY=${key}\n`;
        writeFileSync(envPath, newContent, "utf8");
        console.log(`  ✓ API key generated and saved to .env`);
      } else {
        console.log(`  • API key already exists in .env`);
      }
    }
  }
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec("PRAGMA journal_mode = DELETE");
  db.close();

  console.log("\n🪽 Initialization complete!");
  console.log("\nNext steps:");
  console.log("  1. Edit .env with your API keys and adapter settings");
  console.log("  2. mercury workspace create <name>  — create a workspace");
  console.log("  3. mercury ext add <source>          — install extensions");
  console.log("  4. mercury build                     — build image locally");
}
