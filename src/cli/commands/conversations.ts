import type { Command } from "commander";
import { apiCall } from "../helpers.js";

type Conversation = {
  id: number;
  platform: string;
  externalId: string;
  observedTitle: string | null;
  paired: number;
};

export function registerConversationCommands(convosCommand: Command): void {
  convosCommand
    .command("list")
    .description("List all conversations")
    .action(async () => {
      try {
        const data = await apiCall<{ conversations: Conversation[] }>("GET", "/conversations");
        if (data.conversations.length === 0) {
          console.log("No conversations found.");
          return;
        }
        for (const c of data.conversations) {
          const title = c.observedTitle || c.externalId;
          const status = c.paired ? "✓ paired" : "  unpaired";
          console.log(`${c.id}\t${status}\t${c.platform}\t${title}`);
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
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
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

export async function pairAction(): Promise<void> {
  try {
    const data = await apiCall<{ code: string }>("GET", "/conversations/pairing-code");
    console.log(`Pairing code: ${data.code}`);
    console.log(`Send "/pair ${data.code}" in any group chat to pair it with this deployment.`);
    console.log(`Send "/pair ${data.code}" in a DM to become admin.`);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error("Is Mercury running? Try: mercury status");
    process.exit(1);
  }
}
