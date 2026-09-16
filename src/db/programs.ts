import { db } from "./index";
import { config } from "../config";

export interface Program {
  id: number;
  name: string;
  help_channel_id: string;
  bts_channel_id: string;
  usergroup_id: string;
  admin_user_id: string;
  welcome_message: string | null;
  faq_url: string | null;
  admin_url_template: string | null;
  created_at: number;
}

export function isSuperAdmin(userId: string): boolean {
  return config.superAdminUserIds.includes(userId);
}

export function createProgram(input: {
  name: string;
  helpChannelId: string;
  btsChannelId: string;
  usergroupId: string;
  adminUserId: string;
  welcomeMessage?: string | null;
  faqUrl?: string | null;
  adminUrlTemplate?: string | null;
}): Program {
  const result = db
    .prepare(
      `INSERT INTO programs
         (name, help_channel_id, bts_channel_id, usergroup_id, admin_user_id, welcome_message, faq_url, admin_url_template, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.helpChannelId,
      input.btsChannelId,
      input.usergroupId,
      input.adminUserId,
      input.welcomeMessage ?? null,
      input.faqUrl ?? null,
      input.adminUrlTemplate ?? null,
      Date.now()
    );
  return getProgramById(Number(result.lastInsertRowid))!;
}

export function updateProgram(
  id: number,
  fields: Partial<{
    name: string;
    helpChannelId: string;
    btsChannelId: string;
    usergroupId: string;
    adminUserId: string;
    welcomeMessage: string | null;
    faqUrl: string | null;
    adminUrlTemplate: string | null;
  }>
): Program {
  const columnMap: Record<string, string> = {
    name: "name",
    helpChannelId: "help_channel_id",
    btsChannelId: "bts_channel_id",
    usergroupId: "usergroup_id",
    adminUserId: "admin_user_id",
    welcomeMessage: "welcome_message",
    faqUrl: "faq_url",
    adminUrlTemplate: "admin_url_template",
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columnMap)) {
    if (key in fields) {
      sets.push(`${column} = ?`);
      values.push((fields as Record<string, unknown>)[key]);
    }
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE programs SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  }

  return getProgramById(id)!;
}

export function deleteProgram(id: number): void {
  db.prepare(`DELETE FROM programs WHERE id = ?`).run(id);
}

export function getProgramById(id: number): Program | undefined {
  return db.prepare(`SELECT * FROM programs WHERE id = ?`).get(id) as Program | undefined;
}

export function getProgramByHelpChannel(channelId: string): Program | undefined {
  return db.prepare(`SELECT * FROM programs WHERE help_channel_id = ?`).get(channelId) as
    | Program
    | undefined;
}

export function listPrograms(): Program[] {
  return db.prepare(`SELECT * FROM programs ORDER BY name ASC`).all() as Program[];
}
