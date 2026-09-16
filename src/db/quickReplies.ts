import { db } from "./index";

export interface QuickReply {
  id: number;
  program_id: number;
  key: string;
  label: string;
  message: string;
  position: number;
}

export function listQuickReplies(programId: number): QuickReply[] {
  return db
    .prepare(`SELECT * FROM quick_replies WHERE program_id = ? ORDER BY position ASC, id ASC`)
    .all(programId) as QuickReply[];
}

export function getQuickReply(id: number): QuickReply | undefined {
  return db.prepare(`SELECT * FROM quick_replies WHERE id = ?`).get(id) as QuickReply | undefined;
}

export function findQuickReplyByKey(programId: number, key: string): QuickReply | undefined {
  return db
    .prepare(`SELECT * FROM quick_replies WHERE program_id = ? AND key = ?`)
    .get(programId, key) as QuickReply | undefined;
}

function slugifyKey(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "reply";
}

export function addQuickReply(programId: number, label: string, message: string): QuickReply {
  const existing = listQuickReplies(programId);
  let key = slugifyKey(label);
  // Keep keys unique within a program without making the caller think about it.
  if (existing.some((s) => s.key === key)) {
    key = `${key}_${existing.length + 1}`;
  }
  const position = existing.length;

  const result = db
    .prepare(
      `INSERT INTO quick_replies (program_id, key, label, message, position) VALUES (?, ?, ?, ?, ?)`
    )
    .run(programId, key, label, message, position);
  return getQuickReply(Number(result.lastInsertRowid))!;
}

export function updateQuickReply(
  id: number,
  fields: Partial<{ label: string; message: string }>
): QuickReply {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.label !== undefined) {
    sets.push("label = ?");
    values.push(fields.label);
  }
  if (fields.message !== undefined) {
    sets.push("message = ?");
    values.push(fields.message);
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE quick_replies SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  }
  return getQuickReply(id)!;
}

export function deleteQuickReply(id: number): void {
  db.prepare(`DELETE FROM quick_replies WHERE id = ?`).run(id);
}
