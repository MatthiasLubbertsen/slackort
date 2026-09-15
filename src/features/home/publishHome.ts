import type { KnownBlock } from "@slack/bolt";
import { app } from "../../slack/app";
import { config } from "../../config";
import { countOpenTickets, leaderboard, type LeaderboardRow } from "../../db/tickets";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function renderLeaderboard(rows: LeaderboardRow[]): string {
  if (rows.length === 0) return "_nobody's resolved a ticket yet_";
  const medals = ["🥇", "🥈", "🥉"];
  return rows
    .map((row, i) => `${medals[i] ?? `${i + 1}.`} <@${row.resolved_by}>, ${row.count} resolved`)
    .join("\n");
}

export async function publishHomeView(userId: string): Promise<void> {
  const openCount = countOpenTickets();
  const weekly = leaderboard(Date.now() - ONE_WEEK_MS);
  const allTime = leaderboard();

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Hestia", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${openCount}* ticket${openCount === 1 ? "" : "s"} currently open in <#${config.supportChannelId}>`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `📖 <${config.faqCanvasUrl}|Open the FAQ canvas>` },
    },
    { type: "divider" },
    {
      type: "header",
      text: { type: "plain_text", text: "🏆 Helper leaderboard: this week", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: renderLeaderboard(weekly) },
    },
    { type: "divider" },
    {
      type: "header",
      text: { type: "plain_text", text: "🏆 Helper leaderboard: all time", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: renderLeaderboard(allTime) },
    },
  ];

  await app.client.views.publish({
    user_id: userId,
    view: {
      type: "home",
      blocks,
    },
  });
}

export function registerHome(): void {
  app.event("app_home_opened", async ({ event }) => {
    if (event.tab !== "home") return;
    await publishHomeView(event.user);
  });
}
