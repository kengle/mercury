import { existsSync, unlinkSync } from "node:fs";
import {
  createAgentSession,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";

export interface CompactResult {
  compacted: boolean;
  tokensBefore?: number;
  summary?: string;
  error?: string;
}

export async function compactSession(
  sessionFile: string,
  _config: AppConfig,
): Promise<CompactResult> {
  if (!existsSync(sessionFile)) {
    return { compacted: false, error: "No session file found" };
  }

  try {
    const sessionManager = SessionManager.open(sessionFile);
    const entries = sessionManager.getEntries();

    if (entries.length === 0) {
      return { compacted: false, error: "Session is empty" };
    }

    logger.info("Compacting pi session", {
      sessionFile,
      entryCount: entries.length,
    });

    const { session } = await createAgentSession({
      sessionManager,
      cwd: sessionManager.getCwd(),
    });

    const result = await session.compact();

    logger.info("Pi session compacted", {
      sessionFile,
      tokensBefore: result.tokensBefore,
      summaryLength: result.summary.length,
    });

    return {
      compacted: true,
      tokensBefore: result.tokensBefore,
      summary: result.summary,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to compact pi session", { sessionFile, error: msg });
    return { compacted: false, error: msg };
  }
}

export function newSession(sessionFile: string): boolean {
  if (!existsSync(sessionFile)) return false;
  try {
    unlinkSync(sessionFile);
    logger.info("Session reset", { sessionFile });
    return true;
  } catch (error) {
    logger.error("Failed to reset session", {
      sessionFile,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
