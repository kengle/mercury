import { Database } from "bun:sqlite";

export type { Database as Db } from "bun:sqlite";

import fs from "node:fs";
import path from "node:path";
import { schema as extensionState } from "../extensions/entity.js";
import { schema as apiKeys } from "../services/api-keys/entity.js";
import { schema as config } from "../services/config/entity.js";
import { schema as conversations } from "../services/conversations/entity.js";
import { schema as messages } from "../services/messages/entity.js";
import { schema as mutes } from "../services/mutes/entity.js";
import { schema as roles } from "../services/roles/entity.js";
import { schema as tasks } from "../services/tasks/entity.js";
import { schema as users } from "../services/users/entity.js";
import { schema as workspaces } from "../services/workspaces/entity.js";

// workspaces first so it exists before conversations (which stores workspace_id)
const schemas = [
  workspaces,
  users,
  conversations,
  messages,
  tasks,
  roles,
  config,
  mutes,
  extensionState,
  apiKeys,
];

export function createDatabase(dbPath: string): Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  for (const s of schemas) {
    db.exec(s);
  }

  return db;
}
