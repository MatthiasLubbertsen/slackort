import { db } from "./index";

export type HomeTab = "overview" | "mine";

export function getHomeTabPref(userId: string): HomeTab {
  const row = db.prepare(`SELECT tab FROM home_tab_prefs WHERE user_id = ?`).get(userId) as
    | { tab: HomeTab }
    | undefined;
  return row?.tab ?? "overview";
}

export function setHomeTabPref(userId: string, tab: HomeTab): void {
  db.prepare(
    `INSERT INTO home_tab_prefs (user_id, tab) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET tab = excluded.tab`
  ).run(userId, tab);
}
