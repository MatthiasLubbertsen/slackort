import { db } from "./index";

export type HomeTab = "overview" | "mine" | "admin";

interface HomeTabPrefRow {
  tab: HomeTab;
  selected_program_id: number | null;
}

function getRow(userId: string): HomeTabPrefRow | undefined {
  return db.prepare(`SELECT tab, selected_program_id FROM home_tab_prefs WHERE user_id = ?`).get(
    userId
  ) as HomeTabPrefRow | undefined;
}

export function getHomeTabPref(userId: string): HomeTab {
  return getRow(userId)?.tab ?? "overview";
}

export function setHomeTabPref(userId: string, tab: HomeTab): void {
  db.prepare(
    `INSERT INTO home_tab_prefs (user_id, tab) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET tab = excluded.tab`
  ).run(userId, tab);
}

export function getSelectedProgramId(userId: string): number | undefined {
  return getRow(userId)?.selected_program_id ?? undefined;
}

export function setSelectedProgramId(userId: string, programId: number): void {
  db.prepare(
    `INSERT INTO home_tab_prefs (user_id, tab, selected_program_id) VALUES (?, 'overview', ?)
     ON CONFLICT(user_id) DO UPDATE SET selected_program_id = excluded.selected_program_id`
  ).run(userId, programId);
}
