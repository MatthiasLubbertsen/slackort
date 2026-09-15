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
    reply_ts TEXT,
    opener_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_resolved_by ON tickets(resolved_by);
  CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
`);

function ensureColumn(table: string, column: string, columnDdl: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`);
  }
}

// Added after the initial release -- keeps older sqlite files working without a fresh install.
ensureColumn("tickets", "resolution_ts", "resolution_ts TEXT");
ensureColumn("tickets", "resolution_note", "resolution_note TEXT");
ensureColumn("tickets", "assigned_to", "assigned_to TEXT");
