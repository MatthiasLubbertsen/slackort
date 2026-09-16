import { db } from "./index";

export interface ProgramShortcut {
  id: number;
  program_id: number;
  key: string;
  label: string;
  message: string;
  position: number;
}

export function listProgramShortcuts(programId: number): ProgramShortcut[] {
  return db
    .prepare(`SELECT * FROM program_shortcuts WHERE program_id = ? ORDER BY position ASC, id ASC`)
    .all(programId) as ProgramShortcut[];
}

export function getProgramShortcut(id: number): ProgramShortcut | undefined {
  return db.prepare(`SELECT * FROM program_shortcuts WHERE id = ?`).get(id) as
    | ProgramShortcut
    | undefined;
}

export function findProgramShortcutByKey(
  programId: number,
  key: string
): ProgramShortcut | undefined {
  return db
    .prepare(`SELECT * FROM program_shortcuts WHERE program_id = ? AND key = ?`)
    .get(programId, key) as ProgramShortcut | undefined;
}

function slugifyKey(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "shortcut";
}

export function addProgramShortcut(
  programId: number,
  label: string,
  message: string
): ProgramShortcut {
  const existing = listProgramShortcuts(programId);
  let key = slugifyKey(label);
  // Keep keys unique within a program without making the caller think about it.
  if (existing.some((s) => s.key === key)) {
    key = `${key}_${existing.length + 1}`;
  }
  const position = existing.length;

  const result = db
    .prepare(
      `INSERT INTO program_shortcuts (program_id, key, label, message, position) VALUES (?, ?, ?, ?, ?)`
    )
    .run(programId, key, label, message, position);
  return getProgramShortcut(Number(result.lastInsertRowid))!;
}

export function updateProgramShortcut(
  id: number,
  fields: Partial<{ label: string; message: string }>
): ProgramShortcut {
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
    db.prepare(`UPDATE program_shortcuts SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  }
  return getProgramShortcut(id)!;
}

export function deleteProgramShortcut(id: number): void {
  db.prepare(`DELETE FROM program_shortcuts WHERE id = ?`).run(id);
}
