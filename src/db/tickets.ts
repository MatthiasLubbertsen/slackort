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

export function createTicket(input: {
  channelId: string;
  messageTs: string;
  openerId: string;
  subject: string;
}): Ticket {
  const createdAt = Date.now();
  const result = db
    .prepare(
      `INSERT INTO tickets (channel_id, message_ts, opener_id, subject, status, created_at)
       VALUES (?, ?, ?, ?, 'open', ?)`
    )
    .run(input.channelId, input.messageTs, input.openerId, input.subject, createdAt);
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

export function getTicketsAssignedTo(userId: string): Ticket[] {
  return db
    .prepare(`SELECT * FROM tickets WHERE assigned_to = ? AND status = 'open' ORDER BY created_at ASC`)
    .all(userId) as Ticket[];
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

export function ticketStatsForUser(openerId: string): UserTicketStats {
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE opener_id = ?`).get(openerId) as {
      c: number;
    }
  ).c;
  const open = (
    db
      .prepare(`SELECT COUNT(*) as c FROM tickets WHERE opener_id = ? AND status = 'open'`)
      .get(openerId) as { c: number }
  ).c;
  return { total, open, resolved: total - open };
}

export function countOpenTickets(): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status = 'open'`).get() as {
    c: number;
  };
  return row.c;
}

export function ticketsOpenedBetween(start: number, end: number): Ticket[] {
  return db
    .prepare(`SELECT * FROM tickets WHERE created_at >= ? AND created_at < ?`)
    .all(start, end) as Ticket[];
}

export function ticketsResolvedBetween(start: number, end: number): Ticket[] {
  return db
    .prepare(
      `SELECT * FROM tickets WHERE resolved_at IS NOT NULL AND resolved_at >= ? AND resolved_at < ?`
    )
    .all(start, end) as Ticket[];
}

export function openTicketsCreatedBefore(end: number): Ticket[] {
  return db
    .prepare(`SELECT * FROM tickets WHERE status = 'open' AND created_at < ?`)
    .all(end) as Ticket[];
}

export function listTickets(opts: {
  status?: TicketStatus;
  limit: number;
  offset: number;
}): { tickets: Ticket[]; total: number } {
  const where = opts.status ? `WHERE status = ?` : "";
  const params = opts.status ? [opts.status] : [];

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

/** Category breakdown, optionally restricted to tickets created since `sinceMs`. */
export function ticketCategoryCounts(sinceMs?: number): TicketCategoryCounts {
  const where = sinceMs ? `WHERE created_at >= ?` : "";
  const params = sinceMs ? [sinceMs] : [];

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

/** How many tickets were resolved since `sinceMs`, regardless of when they were created. */
export function closedCountSince(sinceMs: number): number {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM tickets WHERE resolved_at IS NOT NULL AND resolved_at >= ?`)
    .get(sinceMs) as { c: number };
  return row.c;
}

/**
 * Average "hang time" in minutes: for resolved tickets that's time-to-resolve,
 * for still-open ones it's how long they've been sitting so far. Optionally
 * restricted to tickets created since `sinceMs`.
 */
export function averageHangTimeMinutes(sinceMs?: number): number {
  const where = sinceMs ? `WHERE created_at >= ?` : "";
  const params = sinceMs ? [sinceMs] : [];

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

export function leaderboard(sinceMs?: number): LeaderboardRow[] {
  if (sinceMs) {
    return db
      .prepare(
        `SELECT resolved_by, COUNT(*) as count FROM tickets
         WHERE status = 'resolved' AND resolved_at >= ?
         GROUP BY resolved_by ORDER BY count DESC LIMIT 10`
      )
      .all(sinceMs) as LeaderboardRow[];
  }
  return db
    .prepare(
      `SELECT resolved_by, COUNT(*) as count FROM tickets
       WHERE status = 'resolved'
       GROUP BY resolved_by ORDER BY count DESC LIMIT 10`
    )
    .all() as LeaderboardRow[];
}
