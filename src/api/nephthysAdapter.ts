import express, { type Request, type Response } from "express";
import { app as slackApp } from "../slack/app";
import { listPrograms, type Program } from "../db/programs";
import {
  averageResolutionMinutesBetween,
  averageResponseTimeMinutesAll,
  averageResponseTimeMinutesUnresolved,
  getTicketById,
  leaderboard,
  leaderboardBetween,
  listTicketsByCategory,
  oldestOpenUnclaimedTicket,
  ticketCategory,
  ticketCategoryCounts,
  ticketsAssignedBetween,
  ticketsResolvedBetween,
  type Ticket,
  type TicketCategory,
} from "../db/tickets";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/**
 * A compatibility shim, not a reimplementation: this reshapes Hestia's own
 * ticket data into the response shapes documented for Nephthys
 * (https://github.com/hackclub/nephthys/blob/main/docs/api.md), so anything
 * built against a Nephthys instance (a dashboard, a bot, a report) can point
 * at a Program here instead by swapping its base URL. It has none of
 * Nephthys's own storage, Slack app, or ticket-handling logic underneath, it
 * just translates Hestia's shapes into Nephthys's field names for the three
 * documented routes. A few Nephthys fields have nothing to map from --
 * they're called out below, filled with a documented placeholder rather than
 * left out, so the shape still matches.
 */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveProgram(req: Request, res: Response): Program | undefined {
  const slug = req.params.program.toLowerCase();
  const program = listPrograms().find((p) => slugify(p.name) === slug);
  if (!program) {
    res.status(404).json({ error: `no program matches "${req.params.program}"` });
    return undefined;
  }
  return program;
}

function nephthysStatus(category: TicketCategory): "OPEN" | "CLOSED" | "IN_PROGRESS" {
  if (category === "closed") return "CLOSED";
  if (category === "in_progress") return "IN_PROGRESS";
  return "OPEN";
}

/**
 * Nephthys users have their own internal integer ID; Hestia only ever has a
 * Slack user ID, so `id` is always 0 here on purpose -- `slack_id` is the
 * field with real information in it.
 */
function nephthysUser(slackId: string | null): { id: number; slack_id: string; username: null } | null {
  if (!slackId) return null;
  return { id: 0, slack_id: slackId, username: null };
}

function nephthysTicket(ticket: Ticket) {
  return {
    id: ticket.id,
    title: ticket.subject,
    status: nephthysStatus(ticketCategory(ticket)),
    opened_by: nephthysUser(ticket.opener_id),
    closed_by: nephthysUser(ticket.resolved_by),
    assigned_to: nephthysUser(ticket.assigned_to),
    // Reopening a ticket in Hestia just clears its resolution fields, it
    // never records who reopened it -- always null, a real gap, not a bug.
    reopened_by: null as null,
    // Hestia has no tagging concept for tickets.
    team_tags: [] as string[],
    created_at: new Date(ticket.created_at).toISOString(),
    closed_at: ticket.resolved_at ? new Date(ticket.resolved_at).toISOString() : null,
    message_ts: ticket.message_ts,
  };
}

function leaderboardEntries(rows: { resolved_by: string; count: number }[]) {
  return rows.map((row) => ({ id: 0, slack_id: row.resolved_by, count: row.count }));
}

function overallStats(program: Program, oldestUnansweredLink: string | undefined) {
  const oldest = oldestOpenUnclaimedTicket(program.id);
  const counts = ticketCategoryCounts(program.id);

  return {
    tickets_total: counts.total,
    tickets_open: counts.open,
    tickets_closed: counts.closed,
    tickets_in_progress: counts.inProgress,
    helpers_leaderboard: leaderboardEntries(leaderboard(program.id)),
    mean_hang_time_minutes_unresolved: averageResponseTimeMinutesUnresolved(program.id),
    mean_hang_time_minutes_all: averageResponseTimeMinutesAll(program.id),
    mean_resolution_time_minutes: averageResolutionMinutesBetween(program.id),
    oldest_unanswered_ticket: oldest
      ? {
          id: oldest.id,
          created_at: new Date(oldest.created_at).toISOString(),
          age_minutes: Math.round((Date.now() - oldest.created_at) / 60000),
          link: oldestUnansweredLink ?? "",
        }
      : null,
  };
}

function timeBoundStats(program: Program, start: number, end: number) {
  const opened = listTicketsByCategory({ programId: program.id, createdAfter: start, createdBefore: end });
  const resolvedInWindow = ticketsResolvedBetween(program.id, start, end);

  return {
    new_tickets_total: opened.length,
    new_tickets_now_closed: opened.filter((t) => ticketCategory(t) === "closed").length,
    new_tickets_still_open: opened.filter((t) => ticketCategory(t) === "open").length,
    new_tickets_in_progress: opened.filter((t) => ticketCategory(t) === "in_progress").length,
    closed_today: resolvedInWindow.length,
    closed_today_from_today: resolvedInWindow.filter((t) => t.created_at >= start && t.created_at < end)
      .length,
    assigned_today_in_progress: ticketsAssignedBetween(program.id, start, end).filter(
      (t) => ticketCategory(t) === "in_progress"
    ).length,
    helpers_leaderboard: leaderboardEntries(leaderboardBetween(program.id, start, end)),
    mean_hang_time_minutes_unresolved: averageResponseTimeMinutesUnresolved(program.id, start, end),
    mean_hang_time_minutes_all: averageResponseTimeMinutesAll(program.id, start, end),
    mean_resolution_time_minutes: averageResolutionMinutesBetween(program.id, start, end),
  };
}

export function nephthysRouter(): express.Router {
  const router = express.Router();

  router.get("/:program/api/stats_v2", async (req, res) => {
    const program = resolveProgram(req, res);
    if (!program) return;

    const oldest = oldestOpenUnclaimedTicket(program.id);
    const oldestLink = oldest
      ? await slackApp.client.chat
          .getPermalink({ channel: oldest.channel_id, message_ts: oldest.message_ts })
          .then((r) => r.permalink)
          .catch(() => undefined)
      : undefined;

    const now = Date.now();
    res.json({
      all_time: overallStats(program, oldestLink),
      past_24h: timeBoundStats(program, now - ONE_DAY_MS, now),
      past_24h_previous: timeBoundStats(program, now - 2 * ONE_DAY_MS, now - ONE_DAY_MS),
      past_7d: timeBoundStats(program, now - ONE_WEEK_MS, now),
      past_7d_previous: timeBoundStats(program, now - 2 * ONE_WEEK_MS, now - ONE_WEEK_MS),
    });
  });

  router.get("/:program/api/tickets", (req, res) => {
    const program = resolveProgram(req, res);
    if (!program) return;

    const statusParam = req.query.status;
    const category: TicketCategory | undefined =
      statusParam === "open" || statusParam === "closed" || statusParam === "in_progress"
        ? statusParam
        : undefined;

    const sinceParam = (req.query.since ?? req.query.after) as string | undefined;
    const untilParam = (req.query.until ?? req.query.before) as string | undefined;
    const createdAfter = sinceParam ? Date.parse(sinceParam) : undefined;
    const createdBefore = untilParam ? Date.parse(untilParam) : undefined;

    const tickets = listTicketsByCategory({
      programId: program.id,
      category,
      createdAfter: Number.isNaN(createdAfter) ? undefined : createdAfter,
      createdBefore: Number.isNaN(createdBefore) ? undefined : createdBefore,
    });

    res.json(tickets.map(nephthysTicket));
  });

  router.get("/:program/api/ticket", (req, res) => {
    const program = resolveProgram(req, res);
    if (!program) return;

    const id = Number(req.query.id);
    const ticket = id ? getTicketById(id) : undefined;
    if (!ticket || ticket.program_id !== program.id) {
      res.status(404).json({ error: "ticket not found" });
      return;
    }

    res.json(nephthysTicket(ticket));
  });

  return router;
}
