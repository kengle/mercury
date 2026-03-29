import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { CWD } from "../helpers.js";

export async function chatAction(
  textParts: string[],
  options: {
    port: string;
    file?: string[];
    caller: string;
    workspace?: string;
    json?: boolean;
  },
): Promise<void> {
  let text: string;
  if (textParts.length > 0) {
    text = textParts.join(" ");
  } else if (!process.stdin.isTTY) {
    text = readFileSync("/dev/stdin", "utf-8").trim();
  } else {
    console.error("Usage: mercury chat <message>");
    console.error('       echo "message" | mercury chat');
    process.exit(1);
  }

  if (!text) {
    console.error("Error: empty message");
    process.exit(1);
  }

  const url = `http://localhost:${options.port}/chat`;
  if (!options.workspace) {
    console.error("Error: --workspace is required");
    console.error("Usage: mercury chat --workspace <name> <message>");
    process.exit(1);
  }

  const body: Record<string, unknown> = {
    text,
    callerId: options.caller,
    workspace: options.workspace,
  };

  if (options.file && options.file.length > 0) {
    const files: Array<{ name: string; data: string }> = [];
    for (const filePath of options.file) {
      const abs = resolve(CWD, filePath);
      if (!existsSync(abs)) {
        console.error(`Error: file not found: ${filePath}`);
        process.exit(1);
      }
      files.push({
        name: basename(abs),
        data: readFileSync(abs).toString("base64"),
      });
    }
    body.files = files;
  }

  try {
    const hdrs: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = process.env.MERCURY_API_KEY;
    if (apiKey) hdrs.authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.error(
        `Error: ${(err as { error?: string }).error || res.statusText}`,
      );
      process.exit(1);
    }

    const data = (await res.json()) as {
      reply: string;
      files: Array<{
        filename: string;
        mimeType: string;
        sizeBytes: number;
        data: string;
      }>;
    };

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      if (data.reply) console.log(data.reply);
      if (data.files && data.files.length > 0) {
        for (const f of data.files) {
          const outPath = join(CWD, f.filename);
          writeFileSync(outPath, Buffer.from(f.data, "base64"));
          console.error(`→ ${outPath} (${(f.sizeBytes / 1024).toFixed(1)} KB)`);
        }
      }
    }
  } catch (err) {
    if (
      err instanceof TypeError &&
      (err.message.includes("fetch") || err.message.includes("ECONNREFUSED"))
    ) {
      console.error(
        `Error: cannot connect to Mercury at localhost:${options.port}`,
      );
      console.error("Is Mercury running? Try: mercury status");
    } else {
      console.error(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    process.exit(1);
  }
}
