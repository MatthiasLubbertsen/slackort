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

  CREATE TABLE IF NOT EXISTS home_tab_prefs (
    user_id TEXT PRIMARY KEY,
    tab TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    help_channel_id TEXT NOT NULL UNIQUE,
    bts_channel_id TEXT NOT NULL,
    usergroup_id TEXT NOT NULL,
    admin_user_id TEXT NOT NULL,
    welcome_message TEXT,
    faq_url TEXT,
    admin_url_template TEXT,
    created_at INTEGER NOT NULL
  );
`);

function tableExists(name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

// program_shortcuts was renamed to quick_replies before this ever shipped
// widely -- carry over any rows from a brief earlier deploy instead of
// losing them.
if (tableExists("program_shortcuts") && !tableExists("quick_replies")) {
  db.exec(`ALTER TABLE program_shortcuts RENAME TO quick_replies`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS quick_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    message TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_quick_replies_program_id ON quick_replies(program_id);
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
ensureColumn("tickets", "program_id", "program_id INTEGER");
ensureColumn("home_tab_prefs", "selected_program_id", "selected_program_id INTEGER");
