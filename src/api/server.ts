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
import { getProgramById, listPrograms } from "../db/programs";
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

/** Every program-scoped endpoint needs a valid ?programId=, this resolves it or writes the 400 itself. */
function requireProgramId(req: express.Request, res: express.Response): number | undefined {
  const programId = Number(req.query.programId);
  if (!programId || !getProgramById(programId)) {
    res.status(400).json({ error: "valid programId query param required, see /api/programs" });
    return undefined;
  }
  return programId;
}

async function serializeTicket(
  ticket: Ticket,
  opts: { names?: boolean; permalink?: boolean } = {}
) {
  const base = {
    id: ticket.id,
    programId: ticket.program_id,
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

function overviewPayload(programId: number) {
  const allTime = ticketCategoryCounts(programId);
  const last24h = ticketCategoryCounts(programId, Date.now() - ONE_DAY_MS);

  return {
    allTime: {
      ...allTime,
      hangTimeMinutes: Math.round(averageHangTimeMinutes(programId)),
    },
    past24h: {
      ...last24h,
      closedToday: closedCountSince(programId, Date.now() - ONE_DAY_MS),
      hangTimeMinutes: Math.round(averageHangTimeMinutes(programId, Date.now() - ONE_DAY_MS)),
    },
    leaderboard: {
      past24h: leaderboard(programId, Date.now() - ONE_DAY_MS),
      weekly: leaderboard(programId, Date.now() - ONE_WEEK_MS),
      allTime: leaderboard(programId),
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

  api.get("/api/programs", (_req, res) => {
    res.json({
      programs: listPrograms().map((p) => ({
        id: p.id,
        name: p.name,
        helpChannelId: p.help_channel_id,
        btsChannelId: p.bts_channel_id,
      })),
    });
  });

  api.get("/api/overview", (req, res) => {
    const programId = requireProgramId(req, res);
    if (!programId) return;
    res.json(overviewPayload(programId));
  });

  api.get("/api/tickets", async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const statusParam = req.query.status;
    const status =
      statusParam === "open" || statusParam === "resolved"
        ? (statusParam as TicketStatus)
        : undefined;
    const withNames = req.query.names === "true";
    const programId = req.query.programId ? Number(req.query.programId) : undefined;

    const { tickets, total } = listTickets({ programId, status, limit, offset });
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
    const programId = requireProgramId(req, res);
    if (!programId) return;
    res.json(ticketStatsForUser(req.params.userId, programId));
  });

  api.get("/api/leaderboard", (req, res) => {
    const programId = requireProgramId(req, res);
    if (!programId) return;
    const range = req.query.range === "week" ? Date.now() - ONE_WEEK_MS : undefined;
    res.json({ leaderboard: leaderboard(programId, range) });
  });

  api.listen(config.apiPort, () => {
    console.log(`Stats API listening on :${config.apiPort}`);
  });
}
