import { Database } from "bun:sqlite";

export type { Database as Db } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

import { schema as users } from "../services/users/entity.js";
import { schema as conversations } from "../services/conversations/entity.js";
import { schema as messages } from "../services/messages/entity.js";
import { schema as tasks } from "../services/tasks/entity.js";
import { schema as roles } from "../services/roles/entity.js";
import { schema as config } from "../services/config/entity.js";
import { schema as mutes } from "../services/mutes/entity.js";
import { schema as extensionState } from "../extensions/entity.js";
import { schema as apiKeys } from "../services/api-keys/entity.js";

const schemas = [users, conversations, messages, tasks, roles, config, mutes, extensionState, apiKeys];

export function createDatabase(dbPath: string): Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;

  for (const s of schemas) {
    db.exec(s);
  }

  const migrations: Array<() => void> = [
    // Migration 0→1: (reserved — base schema)
  ];

  for (let i = version; i < migrations.length; i++) {
    migrations[i]();
  }

  if (migrations.length > version) {
    db.exec(`PRAGMA user_version = ${migrations.length}`);
  }

  return db;
}
