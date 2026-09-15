import express from "express";
import { app as slackApp } from "../slack/app";
import { config } from "../config";
import {
  averageHangTimeMinutes,
  closedCountSince,
  getTicketById,
  leaderboard,
  listTickets,
  ticketCategory,
  ticketCategoryCounts,
  ticketStatsForUser,
  type Ticket,
  type TicketStatus,
} from "../db/tickets";
import { getFriendlyName } from "../slack/userName";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function parsePagination(query: express.Request["query"]) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}

async function serializeTicket(
  ticket: Ticket,
  opts: { names?: boolean; permalink?: boolean } = {}
) {
  const base = {
    id: ticket.id,
    channelId: ticket.channel_id,
    messageTs: ticket.message_ts,
    openerId: ticket.opener_id,
    subject: ticket.subject,
    status: ticket.status,
    category: ticketCategory(ticket),
    assignedTo: ticket.assigned_to,
    createdAt: ticket.created_at,
    resolvedAt: ticket.resolved_at,
    resolvedBy: ticket.resolved_by,
    resolutionNote: ticket.resolution_note,
  };

  const extra: Record<string, unknown> = {};

  if (opts.names) {
    extra.openerName = await getFriendlyName(slackApp.client, ticket.opener_id);
    extra.resolvedByName = ticket.resolved_by
      ? await getFriendlyName(slackApp.client, ticket.resolved_by)
      : null;
    extra.assignedToName = ticket.assigned_to
      ? await getFriendlyName(slackApp.client, ticket.assigned_to)
      : null;
  }

  if (opts.permalink) {
    extra.permalink = await slackApp.client.chat
      .getPermalink({ channel: ticket.channel_id, message_ts: ticket.message_ts })
      .then((r) => r.permalink)
      .catch(() => null);
  }

  return { ...base, ...extra };
}

function overviewPayload() {
  const allTime = ticketCategoryCounts();
  const last24h = ticketCategoryCounts(Date.now() - ONE_DAY_MS);

  return {
    allTime: {
      ...allTime,
      hangTimeMinutes: Math.round(averageHangTimeMinutes()),
    },
    past24h: {
      ...last24h,
      closedToday: closedCountSince(Date.now() - ONE_DAY_MS),
      hangTimeMinutes: Math.round(averageHangTimeMinutes(Date.now() - ONE_DAY_MS)),
    },
    leaderboard: {
      past24h: leaderboard(Date.now() - ONE_DAY_MS),
      weekly: leaderboard(Date.now() - ONE_WEEK_MS),
      allTime: leaderboard(),
    },
  };
}

/**
 * Starts a read-only, unauthenticated JSON API for ticket stats and details.
 * No write endpoints exist anywhere in this file, on purpose -- that's the
 * whole reason it's safe to leave open with no API key. Set API_PORT to 0
 * to turn it off entirely.
 */
export function registerApiServer(): void {
  if (!config.apiPort) {
    console.log("Stats API disabled (API_PORT=0)");
    return;
  }

  const api = express();

  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  api.get("/api/overview", (_req, res) => {
    res.json(overviewPayload());
  });

  api.get("/api/tickets", async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const statusParam = req.query.status;
    const status =
      statusParam === "open" || statusParam === "resolved"
        ? (statusParam as TicketStatus)
        : undefined;
    const withNames = req.query.names === "true";

    const { tickets, total } = listTickets({ status, limit, offset });
    const serialized = await Promise.all(tickets.map((t) => serializeTicket(t, { names: withNames })));
    res.json({ tickets: serialized, total, limit, offset });
  });

  api.get("/api/tickets/:id", async (req, res) => {
    const ticket = getTicketById(Number(req.params.id));
    if (!ticket) {
      res.status(404).json({ error: "not found" });
      return;
    }

    res.json(await serializeTicket(ticket, { names: true, permalink: true }));
  });

  api.get("/api/users/:userId/stats", (req, res) => {
    res.json(ticketStatsForUser(req.params.userId));
  });

  api.get("/api/leaderboard", (req, res) => {
    const range = req.query.range === "week" ? Date.now() - ONE_WEEK_MS : undefined;
    res.json({ leaderboard: leaderboard(range) });
  });

  api.listen(config.apiPort, () => {
    console.log(`Stats API listening on :${config.apiPort}`);
  });
}
