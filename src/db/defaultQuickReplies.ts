import { db } from "./index";
import { slugifyKey } from "../utils/slugifyKey";
import { addQuickReply } from "./quickReplies";

export interface DefaultQuickReply {
  id: number;
  key: string;
  label: string;
  message: string;
  position: number;
}

export function listDefaultQuickReplies(): DefaultQuickReply[] {
  return db
    .prepare(`SELECT * FROM default_quick_replies ORDER BY position ASC, id ASC`)
    .all() as DefaultQuickReply[];
}

export function getDefaultQuickReply(id: number): DefaultQuickReply | undefined {
  return db.prepare(`SELECT * FROM default_quick_replies WHERE id = ?`).get(id) as
    | DefaultQuickReply
    | undefined;
}

export function addDefaultQuickReply(label: string, message: string): DefaultQuickReply {
  const existing = listDefaultQuickReplies();
  let key = slugifyKey(label);
  if (existing.some((s) => s.key === key)) {
    key = `${key}_${existing.length + 1}`;
  }
  const position = existing.length;

  const result = db
    .prepare(`INSERT INTO default_quick_replies (key, label, message, position) VALUES (?, ?, ?, ?)`)
    .run(key, label, message, position);
  return getDefaultQuickReply(Number(result.lastInsertRowid))!;
}

export function updateDefaultQuickReply(
  id: number,
  fields: Partial<{ label: string; message: string }>
): DefaultQuickReply {
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
    db.prepare(`UPDATE default_quick_replies SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  }
  return getDefaultQuickReply(id)!;
}

export function deleteDefaultQuickReply(id: number): void {
  db.prepare(`DELETE FROM default_quick_replies WHERE id = ?`).run(id);
}

/**
 * Copies the current default list onto a Program at creation time. A
 * snapshot, not a live link -- editing or deleting a Program's own copy
 * afterward never touches the defaults, and changing the defaults later
 * never touches Programs that already exist.
 */
export function seedDefaultQuickRepliesInto(programId: number): void {
  for (const d of listDefaultQuickReplies()) {
    addQuickReply(programId, d.label, d.message);
  }
}
