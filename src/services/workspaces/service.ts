import type { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { ensurePiResourceDir } from "../../core/runtime/workspace.js";
import type { ConfigService } from "../config/interface.js";
import type { WorkspaceService } from "./interface.js";
import type { WorkspaceEntity } from "./models.js";

const COLUMNS = `id, name, created_at as createdAt, updated_at as updatedAt`;

const WORKSPACE_SUBDIRS = [
  "inbox",
  "outbox",
  "knowledge",
  "sessions",
  ".messages",
];

function scaffoldWorkspaceDir(workspacesRoot: string, name: string): void {
  const wsDir = path.join(workspacesRoot, name);
  ensurePiResourceDir(wsDir);
  for (const sub of WORKSPACE_SUBDIRS) {
    fs.mkdirSync(path.join(wsDir, sub), { recursive: true });
  }
}

export function createWorkspaceService(
  db: Database,
  workspacesRoot: string,
  configService: ConfigService,
): WorkspaceService {
  const insert = db.prepare<void, [string, number, number]>(
    `INSERT INTO workspaces(name, created_at, updated_at) VALUES (?, ?, ?)`,
  );
  const selectByName = db.prepare<WorkspaceEntity, [string]>(
    `SELECT ${COLUMNS} FROM workspaces WHERE name = ?`,
  );
  const selectById = db.prepare<WorkspaceEntity, [number]>(
    `SELECT ${COLUMNS} FROM workspaces WHERE id = ?`,
  );
  const selectAll = db.prepare<WorkspaceEntity, []>(
    `SELECT ${COLUMNS} FROM workspaces ORDER BY name ASC`,
  );
  const deleteByName = db.prepare<void, [string]>(
    `DELETE FROM workspaces WHERE name = ?`,
  );
  const countConversations = db.prepare<{ count: number }, [number]>(
    `SELECT COUNT(*) as count FROM conversations WHERE workspace_id = ?`,
  );

  const createTx = db.transaction((name: string) => {
    const now = Date.now();
    insert.run(name, now, now);
    const row = selectByName.get(name);
    if (!row) throw new Error(`Failed to create workspace "${name}"`);
    scaffoldWorkspaceDir(workspacesRoot, name);
    return row;
  });

  return {
    create(name) {
      return createTx(name);
    },
    list() {
      return selectAll.all();
    },
    get(name) {
      return selectByName.get(name) ?? null;
    },
    getById(id) {
      return selectById.get(id) ?? null;
    },
    delete(name) {
      const ws = selectByName.get(name);
      if (!ws) return false;
      const convCount = countConversations.get(ws.id)?.count ?? 0;
      if (convCount > 0) {
        throw new Error(
          `Cannot delete workspace "${name}": ${convCount} conversation(s) still assigned`,
        );
      }
      deleteByName.run(name);
      // Don't delete the directory — leave it for manual cleanup
      return true;
    },
    getConversationCount(workspaceId) {
      return countConversations.get(workspaceId)?.count ?? 0;
    },
    findByPairingCode(code) {
      const allWorkspaces = selectAll.all();
      for (const ws of allWorkspaces) {
        const wsCode = configService.get(ws.id, "_pairing_code");
        if (wsCode && wsCode === code) return ws;
      }
      return null;
    },
    getPairingCode(workspaceId) {
      let code = configService.get(workspaceId, "_pairing_code");
      if (!code) {
        code = Math.random().toString(36).slice(2, 8).toUpperCase();
        configService.set(workspaceId, "_pairing_code", code, "system");
      }
      return code;
    },
    regeneratePairingCode(workspaceId) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      configService.set(workspaceId, "_pairing_code", code, "system");
      return code;
    },
  };
}
