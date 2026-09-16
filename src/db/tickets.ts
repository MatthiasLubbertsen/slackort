import { db } from "./index";

export type TicketStatus = "open" | "resolved";

export interface Ticket {
  id: number;
  channel_id: string;
  message_ts: string;
  reply_ts: string | null;
  resolution_ts: string | null;
  resolution_note: string | null;
  opener_id: string;
  subject: string;
  status: TicketStatus;
  assigned_to: string | null;
  program_id: number;
  created_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
}

/**
 * A ticket's "category" mirrors Stardance's three-state model without
 * changing the underlying open/resolved state machine: resolved tickets are
 * "closed", and an open ticket is "in_progress" once a helper has claimed it,
 * otherwise it's plain "open".
 */
export type TicketCategory = "open" | "in_progress" | "closed";

export function ticketCategory(ticket: Ticket): TicketCategory {
  if (ticket.status === "resolved") return "closed";
  return ticket.assigned_to ? "in_progress" : "open";
}

/**
 * Backfills `program_id` on any pre-existing tickets left over from before
 * Programs existed: their channel_id already tells us which Program they
 * belong to, they just never had the column. Safe to call on every boot,
 * a no-op once nothing is left to backfill.
 */
export function backfillProgramId(programId: number, channelId: string): number {
  return db
    .prepare(`UPDATE tickets SET program_id = ? WHERE channel_id = ? AND program_id IS NULL`)
    .run(programId, channelId).changes as number;
}

export function createTicket(input: {
  channelId: string;
  messageTs: string;
  openerId: string;
  subject: string;
  programId: number;
}): Ticket {
  const createdAt = Date.now();
  const result = db
    .prepare(
      `INSERT INTO tickets (channel_id, message_ts, opener_id, subject, status, created_at, program_id)
       VALUES (?, ?, ?, ?, 'open', ?, ?)`
    )
    .run(input.channelId, input.messageTs, input.openerId, input.subject, createdAt, input.programId);
  return getTicketById(Number(result.lastInsertRowid))!;
}

export function setReplyTs(ticketId: number, replyTs: string): void {
  db.prepare(`UPDATE tickets SET reply_ts = ? WHERE id = ?`).run(replyTs, ticketId);
}

export function setResolutionTs(ticketId: number, resolutionTs: string | null): void {
  db.prepare(`UPDATE tickets SET resolution_ts = ? WHERE id = ?`).run(resolutionTs, ticketId);
}

export function getTicketById(ticketId: number): Ticket | undefined {
  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as Ticket | undefined;
}

export function getTicketByMessageTs(channelId: string, messageTs: string): Ticket | undefined {
  return db
    .prepare(`SELECT * FROM tickets WHERE channel_id = ? AND message_ts = ?`)
    .get(channelId, messageTs) as Ticket | undefined;
}

/**
 * Marks a ticket resolved. `note`, when given, replaces the default "resolved
 * by X" announcement text (used for canned close reasons, which never name
 * who clicked them).
 */
export function resolveTicket(ticketId: number, resolvedBy: string, note?: string): Ticket {
  db.prepare(
    `UPDATE tickets SET status = 'resolved', resolved_at = ?, resolved_by = ?, resolution_note = ? WHERE id = ?`
  ).run(Date.now(), resolvedBy, note ?? null, ticketId);
  return getTicketById(ticketId)!;
}

export function reopenTicket(ticketId: number): Ticket {
  db.prepare(
    `UPDATE tickets SET status = 'open', resolved_at = NULL, resolved_by = NULL, resolution_note = NULL WHERE id = ?`
  ).run(ticketId);
  return getTicketById(ticketId)!;
}

export function deleteTicket(ticketId: number): void {
  db.prepare(`DELETE FROM tickets WHERE id = ?`).run(ticketId);
}

export function claimTicket(ticketId: number, userId: string): Ticket {
  db.prepare(`UPDATE tickets SET assigned_to = ? WHERE id = ?`).run(userId, ticketId);
  return getTicketById(ticketId)!;
}

export function getTicketsAssignedTo(userId: string, programId: number): Ticket[] {
  return db
    .prepare(
      `SELECT * FROM tickets WHERE assigned_to = ? AND program_id = ? AND status = 'open'
       ORDER BY created_at ASC`
    )
    .all(userId, programId) as Ticket[];
}

export function getOpenTicketForUser(channelId: string, openerId: string): Ticket | undefined {
  return db
    .prepare(
      `SELECT * FROM tickets WHERE channel_id = ? AND opener_id = ? AND status = 'open'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(channelId, openerId) as Ticket | undefined;
}

export interface UserTicketStats {
  total: number;
  open: number;
  resolved: number;
}

export function ticketStatsForUser(openerId: string, programId: number): UserTicketStats {
  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM tickets WHERE opener_id = ? AND program_id = ?`)
      .get(openerId, programId) as { c: number }
  ).c;
  const open = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM tickets WHERE opener_id = ? AND program_id = ? AND status = 'open'`
      )
      .get(openerId, programId) as { c: number }
  ).c;
  return { total, open, resolved: total - open };
}

export function ticketsOpenedBetween(programId: number, start: number, end: number): Ticket[] {
  return db
    .prepare(`SELECT * FROM tickets WHERE program_id = ? AND created_at >= ? AND created_at < ?`)
    .all(programId, start, end) as Ticket[];
}

export function ticketsResolvedBetween(programId: number, start: number, end: number): Ticket[] {
  return db
    .prepare(
      `SELECT * FROM tickets WHERE program_id = ? AND resolved_at IS NOT NULL AND resolved_at >= ? AND resolved_at < ?`
    )
    .all(programId, start, end) as Ticket[];
}

export function openTicketsCreatedBefore(programId: number, end: number): Ticket[] {
  return db
    .prepare(`SELECT * FROM tickets WHERE program_id = ? AND status = 'open' AND created_at < ?`)
    .all(programId, end) as Ticket[];
}

export function listTickets(opts: {
  programId?: number;
  status?: TicketStatus;
  limit: number;
  offset: number;
}): { tickets: Ticket[]; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.programId) {
    conditions.push("program_id = ?");
    params.push(opts.programId);
  }
  if (opts.status) {
    conditions.push("status = ?");
    params.push(opts.status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const tickets = db
    .prepare(`SELECT * FROM tickets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, opts.limit, opts.offset) as Ticket[];

  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM tickets ${where}`).get(...params) as { c: number }
  ).c;

  return { tickets, total };
}

export interface TicketCategoryCounts {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
}

/** Category breakdown for one program, optionally restricted to tickets created since `sinceMs`. */
export function ticketCategoryCounts(programId: number, sinceMs?: number): TicketCategoryCounts {
  const conditions = ["program_id = ?"];
  const params: unknown[] = [programId];
  if (sinceMs) {
    conditions.push("created_at >= ?");
    params.push(sinceMs);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'open' AND assigned_to IS NULL THEN 1 ELSE 0 END) as open,
         SUM(CASE WHEN status = 'open' AND assigned_to IS NOT NULL THEN 1 ELSE 0 END) as inProgress,
         SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as closed
       FROM tickets ${where}`
    )
    .get(...params) as { total: number; open: number | null; inProgress: number | null; closed: number | null };

  return {
    total: row.total,
    open: row.open ?? 0,
    inProgress: row.inProgress ?? 0,
    closed: row.closed ?? 0,
  };
}

/** How many of a program's tickets were resolved since `sinceMs`, regardless of when they were created. */
export function closedCountSince(programId: number, sinceMs: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM tickets
       WHERE program_id = ? AND resolved_at IS NOT NULL AND resolved_at >= ?`
    )
    .get(programId, sinceMs) as { c: number };
  return row.c;
}

/**
 * Average "hang time" in minutes for one program: for resolved tickets that's
 * time-to-resolve, for still-open ones it's how long they've been sitting so
 * far. Optionally restricted to tickets created since `sinceMs`.
 */
export function averageHangTimeMinutes(programId: number, sinceMs?: number): number {
  const conditions = ["program_id = ?"];
  const params: unknown[] = [programId];
  if (sinceMs) {
    conditions.push("created_at >= ?");
    params.push(sinceMs);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const rows = db
    .prepare(`SELECT created_at, resolved_at FROM tickets ${where}`)
    .all(...params) as { created_at: number; resolved_at: number | null }[];

  if (rows.length === 0) return 0;

  const now = Date.now();
  const totalMinutes = rows.reduce((sum, t) => sum + ((t.resolved_at ?? now) - t.created_at) / 60000, 0);
  return totalMinutes / rows.length;
}

export interface LeaderboardRow {
  resolved_by: string;
  count: number;
}

export function leaderboard(programId: number, sinceMs?: number): LeaderboardRow[] {
  if (sinceMs) {
    return db
      .prepare(
        `SELECT resolved_by, COUNT(*) as count FROM tickets
         WHERE program_id = ? AND status = 'resolved' AND resolved_at >= ?
         GROUP BY resolved_by ORDER BY count DESC LIMIT 10`
      )
      .all(programId, sinceMs) as LeaderboardRow[];
  }
  return db
    .prepare(
      `SELECT resolved_by, COUNT(*) as count FROM tickets
       WHERE program_id = ? AND status = 'resolved'
       GROUP BY resolved_by ORDER BY count DESC LIMIT 10`
    )
    .all(programId) as LeaderboardRow[];
}
