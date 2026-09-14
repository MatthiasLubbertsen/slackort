import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { config } from "../config";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    message_ts TEXT NOT NULL UNIQUE,
    opener_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_resolved_by ON tickets(resolved_by);
  CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
`);
