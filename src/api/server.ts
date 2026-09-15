import express from "express";
import { app as slackApp } from "../slack/app";
import { config } from "../config";
import {
  countOpenTickets,
  getTicketById,
  leaderboard,
  listTickets,
  ticketStatsForUser,
  type TicketStatus,
} from "../db/tickets";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function parsePagination(query: express.Request["query"]) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}

function serializeTicket(ticket: ReturnType<typeof getTicketById>) {
  if (!ticket) return undefined;
  return {
    id: ticket.id,
    channelId: ticket.channel_id,
    messageTs: ticket.message_ts,
    openerId: ticket.opener_id,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.created_at,
    resolvedAt: ticket.resolved_at,
    resolvedBy: ticket.resolved_by,
    resolutionNote: ticket.resolution_note,
  };
}

/**
 * Starts a read-only JSON API for ticket stats and details. No write
 * endpoints exist anywhere in this file, on purpose. Only starts when both
 * API_PORT and API_TOKEN are set.
 */
export function registerApiServer(): void {
  if (!config.apiPort || !config.apiToken) {
    console.log("Stats API disabled (set API_PORT and API_TOKEN to enable)");
    return;
  }

  const api = express();

  // No auth required, safe to point an uptime checker at this.
  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  api.use("/api", (req, res, next) => {
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (token !== config.apiToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  });

  api.get("/api/overview", (_req, res) => {
    res.json({
      openTickets: countOpenTickets(),
      leaderboard: {
        weekly: leaderboard(Date.now() - ONE_WEEK_MS),
        allTime: leaderboard(),
      },
    });
  });

  api.get("/api/tickets", (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const statusParam = req.query.status;
    const status =
      statusParam === "open" || statusParam === "resolved"
        ? (statusParam as TicketStatus)
        : undefined;

    const { tickets, total } = listTickets({ status, limit, offset });
    res.json({ tickets: tickets.map(serializeTicket), total, limit, offset });
  });

  api.get("/api/tickets/:id", async (req, res) => {
    const ticket = getTicketById(Number(req.params.id));
    if (!ticket) {
      res.status(404).json({ error: "not found" });
      return;
    }

    const permalink = await slackApp.client.chat
      .getPermalink({ channel: ticket.channel_id, message_ts: ticket.message_ts })
      .then((r) => r.permalink)
      .catch(() => undefined);

    res.json({ ...serializeTicket(ticket), permalink });
  });

  api.get("/api/users/:userId/stats", (req, res) => {
    res.json(ticketStatsForUser(req.params.userId));
  });

  api.get("/api/leaderboard", (req, res) => {
    const range = req.query.range === "week" ? Date.now() - ONE_WEEK_MS : undefined;
    res.json({ leaderboard: leaderboard(range) });
  });

  api.listen(config.apiPort, () => {
    console.log(`📊 Stats API listening on :${config.apiPort}`);
  });
}
