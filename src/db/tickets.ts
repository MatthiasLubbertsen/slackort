import { db } from "./index";

export type TicketStatus = "open" | "resolved";

export interface Ticket {
  id: number;
  channel_id: string;
  message_ts: string;
  reply_ts: string | null;
  opener_id: string;
  subject: string;
  status: TicketStatus;
  created_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
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

export function getTicketById(ticketId: number): Ticket | undefined {
  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as Ticket | undefined;
}

export function resolveTicket(ticketId: number, resolvedBy: string): Ticket {
  db.prepare(
    `UPDATE tickets SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ?`
  ).run(Date.now(), resolvedBy, ticketId);
  return getTicketById(ticketId)!;
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
