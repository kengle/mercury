import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { apiCall, CWD } from "../helpers.js";

type Workspace = {
  id: number;
  name: string;
  conversationCount: number;
  pairingCode: string;
  createdAt: number;
};

export function registerWorkspaceCommands(wsCommand: Command): void {
  wsCommand
    .command("create <name>")
    .description("Create a new workspace")
    .action(async (name: string) => {
      try {
        const ws = await apiCall<Workspace>("POST", "/workspaces", { name });
        console.log(
          `✓ Created workspace "${ws.name}" (pairing code: ${ws.pairingCode ?? "N/A"})`,
        );
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  wsCommand
    .command("list")
    .description("List all workspaces")
    .action(async () => {
      try {
        const data = await apiCall<{ workspaces: Workspace[] }>(
          "GET",
          "/workspaces",
        );
        if (data.workspaces.length === 0) {
          console.log("No workspaces found.");
          return;
        }
        for (const ws of data.workspaces) {
          console.log(
            `${ws.name}\t${ws.pairingCode}\t${ws.conversationCount} conversation(s)`,
          );
        }
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  wsCommand
    .command("delete <name>")
    .description("Delete a workspace (must have 0 conversations)")
    .action(async (name: string) => {
      try {
        await apiCall("DELETE", `/workspaces/${encodeURIComponent(name)}`);
        console.log(`✓ Deleted workspace "${name}"`);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  wsCommand
    .command("link <conv-id> <workspace>")
    .description("Assign a conversation to a workspace")
    .action(async (convId: string, workspace: string) => {
      try {
        await apiCall("PUT", `/conversations/${convId}/workspace`, {
          workspace,
        });
        console.log(
          `✓ Linked conversation ${convId} to workspace "${workspace}"`,
        );
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  wsCommand
    .command("unlink <conv-id>")
    .description("Remove a conversation's workspace assignment")
    .action(async (convId: string) => {
      try {
        await apiCall("DELETE", `/conversations/${convId}/workspace`);
        console.log(`✓ Unlinked conversation ${convId}`);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  wsCommand
    .command("pairing-code <workspace>")
    .description("Show the pairing code for a workspace")
    .action(async (workspace: string) => {
      try {
        const data = await apiCall<{ code: string }>(
          "GET",
          `/workspaces/${encodeURIComponent(workspace)}/pairing-code`,
        );
        console.log(`Pairing code for "${workspace}": ${data.code}`);
        console.log(
          `Send "/pair ${data.code}" in any chat to pair it with this workspace.`,
        );
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  // ─── Env management (workspace .env file) ──────────────────────────
  const envCmd = wsCommand
    .command("env")
    .description("Manage workspace environment variables");

  envCmd
    .command("list <workspace>")
    .description("List workspace env vars")
    .action((workspace: string) => {
      const envPath = path.join(CWD, "workspaces", workspace, ".env");
      if (!fs.existsSync(envPath)) {
        console.log("No workspace .env file.");
        return;
      }
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 1) continue;
        const key = trimmed.slice(0, eqIdx);
        const value = trimmed.slice(eqIdx + 1);
        // Mask secrets
        const masked =
          key.toLowerCase().includes("token") ||
          key.toLowerCase().includes("secret") ||
          key.toLowerCase().includes("key")
            ? value.slice(0, 4) + "****"
            : value;
        console.log(`${key}=${masked}`);
      }
    });

  envCmd
    .command("set <workspace> <key> <value>")
    .description("Set a workspace env var")
    .action((workspace: string, key: string, value: string) => {
      const wsDir = path.join(CWD, "workspaces", workspace);
      if (!fs.existsSync(wsDir)) {
        console.error(`Error: workspace "${workspace}" does not exist`);
        process.exit(1);
      }
      const envPath = path.join(wsDir, ".env");
      let lines: string[] = [];
      if (fs.existsSync(envPath)) {
        lines = fs.readFileSync(envPath, "utf8").split("\n");
      }
      const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
      if (idx >= 0) {
        lines[idx] = `${key}=${value}`;
      } else {
        lines.push(`${key}=${value}`);
      }
      fs.writeFileSync(envPath, lines.join("\n"));
      console.log(`✓ ${key} set for workspace "${workspace}"`);
    });

  envCmd
    .command("unset <workspace> <key>")
    .description("Remove a workspace env var")
    .action((workspace: string, key: string) => {
      const envPath = path.join(CWD, "workspaces", workspace, ".env");
      if (!fs.existsSync(envPath)) {
        console.log("No workspace .env file.");
        return;
      }
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      const filtered = lines.filter((l) => !l.startsWith(`${key}=`));
      fs.writeFileSync(envPath, filtered.join("\n"));
      console.log(`✓ ${key} removed from workspace "${workspace}"`);
    });
}
