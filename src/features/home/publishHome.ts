import type { KnownBlock } from "@slack/bolt";
import { app } from "../../slack/app";
import { config } from "../../config";
import {
  averageHangTimeMinutes,
  closedCountSince,
  getTicketsAssignedTo,
  leaderboard,
  ticketCategoryCounts,
  type LeaderboardRow,
} from "../../db/tickets";
import { isHelper } from "../../slack/helpers";
import { buildStatusPieChartUrl } from "./statusChart";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type HomeTab = "overview" | "mine";

function renderLeaderboard(rows: LeaderboardRow[]): string {
  if (rows.length === 0) return "_nobody's resolved a ticket yet_";
  return rows.map((row, i) => `${i + 1}. <@${row.resolved_by}>, ${row.count} resolved`).join("\n");
}

function tabSwitcherBlock(activeTab: HomeTab): KnownBlock {
  return {
    type: "actions",
    block_id: "home_tabs",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "overview" },
        action_id: "home_tab_overview",
        style: activeTab === "overview" ? "primary" : undefined,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "my tickets" },
        action_id: "home_tab_mine",
        style: activeTab === "mine" ? "primary" : undefined,
      },
    ],
  };
}

function statsBoxText(title: string, counts: { total: number; open: number; inProgress: number; closed: number }, hangTimeMinutes: number, extra?: string): string {
  const closedLine = extra ? `Closed: ${counts.closed}, ${extra}` : `Closed: ${counts.closed}`;
  return `*${title}*\nTotal: ${counts.total}, Open: ${counts.open}, In Progress: ${counts.inProgress}, ${closedLine}\nHang time: ${Math.round(hangTimeMinutes)} minutes`;
}

async function overviewBlocks(): Promise<KnownBlock[]> {
  const allTime = ticketCategoryCounts();
  const dayStart = Date.now() - ONE_DAY_MS;
  const last24h = ticketCategoryCounts(dayStart);
  const closedToday = closedCountSince(dayStart);

  const allTimeHangTime = averageHangTimeMinutes();
  const last24hHangTime = averageHangTimeMinutes(dayStart);

  const past24hBoard = leaderboard(dayStart);
  const allTimeBoard = leaderboard();

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `📖 <${config.faqCanvasUrl}|Open the FAQ canvas>` },
    },
    { type: "divider" },
    {
      type: "image",
      image_url: buildStatusPieChartUrl(allTime),
      alt_text: "Ticket status breakdown",
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: statsBoxText("Total Tickets", allTime, allTimeHangTime) },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: statsBoxText("Past 24 Hours", last24h, last24hHangTime, `Closed Today: ${closedToday}`),
      },
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*All-time leaderboard*\n${renderLeaderboard(allTimeBoard)}` },
        { type: "mrkdwn", text: `*Past 24 hours*\n${renderLeaderboard(past24hBoard)}` },
      ],
    },
  ];
}

async function mineBlocks(userId: string): Promise<KnownBlock[]> {
  const helper = await isHelper(userId);
  const assigned = helper ? getTicketsAssignedTo(userId) : [];

  if (!helper || assigned.length === 0) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "aw dang it you don't have any assigned tickets. oh wait that's actually nice, nothing to worry about!",
        },
      },
    ];
  }

  const lines = await Promise.all(
    assigned.map(async (ticket) => {
      const permalink = await app.client.chat
        .getPermalink({ channel: ticket.channel_id, message_ts: ticket.message_ts })
        .then((r) => r.permalink)
        .catch(() => undefined);
      const label = permalink ? `<${permalink}|${ticket.subject}>` : ticket.subject;
      return `• ${label}`;
    })
  );

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Assigned to you* (${assigned.length})\n${lines.join("\n")}` },
    },
  ];
}

export async function publishHomeView(userId: string, tab: HomeTab = "overview"): Promise<void> {
  const blocks: KnownBlock[] = [
    { type: "header", text: { type: "plain_text", text: "Hestia", emoji: true } },
    tabSwitcherBlock(tab),
    { type: "divider" },
    ...(tab === "overview" ? await overviewBlocks() : await mineBlocks(userId)),
  ];

  await app.client.views.publish({
    user_id: userId,
    view: { type: "home", blocks },
  });
}

export function registerHome(): void {
  app.event("app_home_opened", async ({ event }) => {
    if (event.tab !== "home") return;
    await publishHomeView(event.user);
  });

  app.action("home_tab_overview", async ({ ack, body }) => {
    await ack();
    await publishHomeView(body.user.id, "overview");
  });

  app.action("home_tab_mine", async ({ ack, body }) => {
    await ack();
    await publishHomeView(body.user.id, "mine");
  });
}
