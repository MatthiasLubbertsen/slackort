import cron from "node-cron";
import { app } from "../../slack/app";
import { config } from "../../config";
import {
  openTicketsCreatedBefore,
  ticketsOpenedBetween,
  ticketsResolvedBetween,
} from "../../db/tickets";
import { listPrograms, type Program } from "../../db/programs";

function startOfDay(offsetDays = 0): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${rest}m`;
}

async function postDailySummaryForProgram(program: Program): Promise<void> {
  const dayStart = startOfDay(-1);
  const dayEnd = startOfDay(0);

  const opened = ticketsOpenedBetween(program.id, dayStart, dayEnd);
  const resolved = ticketsResolvedBetween(program.id, dayStart, dayEnd);
  const stillOpen = openTicketsCreatedBefore(program.id, dayEnd);

  const avgResolutionMs =
    resolved.length > 0
      ? resolved.reduce((sum, t) => sum + ((t.resolved_at ?? 0) - t.created_at), 0) / resolved.length
      : null;

  const lines = [
    `*Opened:* ${opened.length}`,
    `*Resolved:* ${resolved.length}`,
    `*Still open:* ${stillOpen.length}`,
    avgResolutionMs !== null ? `*Avg. resolution time:* ${formatDuration(avgResolutionMs)}` : null,
  ].filter(Boolean);

  const oldestOpenTickets = stillOpen.sort((a, b) => a.created_at - b.created_at).slice(0, 5);
  const oldestOpenLines = await Promise.all(
    oldestOpenTickets.map(async (t) => {
      const permalink = await app.client.chat
        .getPermalink({ channel: t.channel_id, message_ts: t.message_ts })
        .then((r) => r.permalink)
        .catch(() => undefined);
      const label = permalink ? `<${permalink}|${t.subject}>` : t.subject;
      return `• ${label} (<@${t.opener_id}>)`;
    })
  );
  const oldestOpen = oldestOpenLines.join("\n");

  await app.client.chat.postMessage({
    channel: program.bts_channel_id,
    text: `Daily support summary for ${program.name}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Daily support summary: ${program.name}`, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: lines.join("\n") },
      },
      ...(stillOpen.length > 0
        ? [
            { type: "divider" as const },
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: `*Oldest open tickets:*\n${oldestOpen}` },
            },
          ]
        : []),
    ],
  });
}

export async function postDailySummary(): Promise<void> {
  for (const program of listPrograms()) {
    await postDailySummaryForProgram(program);
  }
}

export function registerDailySummary(): void {
  cron.schedule(
    config.dailySummaryCron,
    () => {
      postDailySummary().catch((err) => {
        console.error("Failed to post daily summary", err);
      });
    },
    { timezone: config.timezone }
  );
}
