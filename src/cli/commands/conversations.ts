import type { Command } from "commander";
import { apiCall } from "../helpers.js";

type Conversation = {
  id: number;
  platform: string;
  externalId: string;
  observedTitle: string | null;
  workspaceId: number | null;
};

export function registerConversationCommands(convosCommand: Command): void {
  convosCommand
    .command("list")
    .description("List all conversations")
    .action(async () => {
      try {
        const data = await apiCall<{ conversations: Conversation[] }>(
          "GET",
          "/conversations",
        );
        if (data.conversations.length === 0) {
          console.log("No conversations found.");
          return;
        }
        for (const c of data.conversations) {
          const title = c.observedTitle || c.externalId;
          const status = c.workspaceId != null ? "✓ paired" : "  unpaired";
          console.log(`${c.id}\t${status}\t${c.platform}\t${title}`);
        }
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        console.error("Is Mercury running? Try: mercury status");
        process.exit(1);
      }
    });

  convosCommand
    .command("unpair <id>")
    .description("Unpair a conversation by ID")
    .action(async (id: string) => {
      const convId = Number.parseInt(id, 10);
      if (!Number.isFinite(convId)) {
        console.error("Error: invalid conversation ID");
        process.exit(1);
      }
      try {
        await apiCall("POST", `/conversations/${convId}/unpair`);
        console.log(`Unpaired conversation ${convId}`);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });
}

export async function pairAction(): Promise<void> {
  try {
    const data = await apiCall<{
      codes: Array<{ workspace: string; code: string }>;
    }>("GET", "/conversations/pairing-code");
    if (data.codes.length > 0) {
      console.log("Pairing codes (per workspace):\n");
      for (const { workspace, code } of data.codes) {
        console.log(`  ${workspace}: ${code}`);
      }
      console.log(
        `\nSend "/pair <CODE>" in any chat to pair it with the corresponding workspace.`,
      );
    } else {
      console.log(
        "No workspaces found. Create one with: mercury workspace create <name>",
      );
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error("Is Mercury running? Try: mercury status");
    process.exit(1);
  }
}
