import type { KnownBlock } from "@slack/bolt";
import { app } from "../../slack/app";
import {
  averageHangTimeMinutes,
  closedCountSince,
  getTicketsAssignedTo,
  leaderboard,
  ticketCategoryCounts,
  type LeaderboardRow,
} from "../../db/tickets";
import {
  getHomeTabPref,
  getSelectedProgramId,
  setHomeTabPref,
  setSelectedProgramId,
  type HomeTab,
} from "../../db/homeTabPrefs";
import { isSuperAdmin, listPrograms, programsVisibleTo, type Program } from "../../db/programs";
import { buildStatusPieChartUrl } from "./statusChart";
import { relativeTimeAgo } from "../../utils/relativeTime";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function renderLeaderboard(rows: LeaderboardRow[]): string {
  if (rows.length === 0) return "_nobody's resolved a ticket yet_";
  return rows.map((row, i) => `${i + 1}. <@${row.resolved_by}>, ${row.count} resolved`).join("\n");
}

function tabSwitcherBlock(activeTab: HomeTab, admin: boolean): KnownBlock {
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
      ...(admin
        ? [
            {
              type: "button" as const,
              text: { type: "plain_text" as const, text: "admin" },
              action_id: "home_tab_admin",
              style: activeTab === "admin" ? ("primary" as const) : undefined,
            },
          ]
        : []),
    ],
  } as KnownBlock;
}

function programPickerBlock(programs: Program[], selected: Program): KnownBlock {
  return {
    type: "actions",
    block_id: "program_picker",
    elements: [
      {
        type: "static_select",
        action_id: "select_program",
        initial_option: {
          text: { type: "plain_text", text: selected.name },
          value: String(selected.id),
        },
        options: programs.map((p) => ({
          text: { type: "plain_text", text: p.name },
          value: String(p.id),
        })),
      },
    ],
  };
}

function statsBoxText(
  title: string,
  counts: { total: number; open: number; inProgress: number; closed: number },
  hangTimeMinutes: number,
  extra?: string
): string {
  const closedLine = extra ? `Closed: ${counts.closed}, ${extra}` : `Closed: ${counts.closed}`;
  return `*${title}*\nTotal: ${counts.total}, Open: ${counts.open}, In Progress: ${counts.inProgress}, ${closedLine}\nHang time: ${Math.round(hangTimeMinutes)} minutes`;
}

function overviewBlocks(program: Program, userId: string): KnownBlock[] {
  const allTime = ticketCategoryCounts(program.id);
  const dayStart = Date.now() - ONE_DAY_MS;
  const last24h = ticketCategoryCounts(program.id, dayStart);
  const closedToday = closedCountSince(program.id, dayStart);

  const allTimeHangTime = averageHangTimeMinutes(program.id);
  const last24hHangTime = averageHangTimeMinutes(program.id, dayStart);

  const past24hBoard = leaderboard(program.id, dayStart);
  const allTimeBoard = leaderboard(program.id);

  const blocks: KnownBlock[] = [
    { type: "divider" },
    {
      type: "image",
      image_url: buildStatusPieChartUrl(allTime),
      alt_text: "Ticket status breakdown",
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: statsBoxText("Total Tickets", allTime, allTimeHangTime) },
        {
          type: "mrkdwn",
          text: statsBoxText("Past 24 Hours", last24h, last24hHangTime, `Closed Today: ${closedToday}`),
        },
      ],
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

  if (program.admin_user_id === userId || isSuperAdmin(userId)) {
    blocks.push(
      { type: "divider" },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "program settings" },
            action_id: `program_settings:${program.id}`,
            value: String(program.id),
          },
        ],
      }
    );
  }

  return blocks;
}

async function mineBlocks(userId: string, program: Program): Promise<KnownBlock[]> {
  const assigned = getTicketsAssignedTo(userId, program.id);

  if (assigned.length === 0) {
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

  const blocks: KnownBlock[] = [];
  for (const ticket of assigned) {
    const permalink = await app.client.chat
      .getPermalink({ channel: ticket.channel_id, message_ts: ticket.message_ts })
      .then((r) => r.permalink)
      .catch(() => undefined);
    const openerName = `<@${ticket.opener_id}>`;
    const opened = relativeTimeAgo(ticket.created_at);

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${ticket.subject}*\nfrom ${openerName}, opened ${opened}` },
      ...(permalink && {
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "view ticket" },
          url: permalink,
          action_id: "view_assigned_ticket",
        },
      }),
    });
  }

  return blocks;
}

function adminBlocks(): KnownBlock[] {
  const programs = listPrograms();

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Programs*" },
    },
  ];

  if (programs.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_no programs yet_" },
    });
  }

  for (const program of programs) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${program.name}*\n<#${program.help_channel_id}> / <#${program.bts_channel_id}>, admin <@${program.admin_user_id}>`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "edit" },
        action_id: `edit_program:${program.id}`,
        value: String(program.id),
      },
    });
  }

  blocks.push(
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "add program" },
          action_id: "add_program",
          style: "primary",
        },
      ],
    }
  );

  return blocks;
}

export async function publishHomeView(
  userId: string,
  tab?: HomeTab,
  programId?: number
): Promise<void> {
  const admin = isSuperAdmin(userId);
  let activeTab = tab ?? getHomeTabPref(userId);
  if (activeTab === "admin" && !admin) activeTab = "overview";
  if (tab) setHomeTabPref(userId, tab);
  if (programId) setSelectedProgramId(userId, programId);

  const visiblePrograms = await programsVisibleTo(userId);
  const blocks: KnownBlock[] = [
    { type: "header", text: { type: "plain_text", text: "Hestia", emoji: true } },
    tabSwitcherBlock(activeTab, admin),
  ];

  if (activeTab === "admin") {
    blocks.push(...adminBlocks());
  } else if (visiblePrograms.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "You're not helping with any programs yet. Ask a super admin to add you to one.",
      },
    });
  } else {
    const selectedId = programId ?? getSelectedProgramId(userId);
    const program =
      visiblePrograms.find((p) => p.id === selectedId) ?? visiblePrograms[0];

    if (visiblePrograms.length > 1) {
      blocks.push(programPickerBlock(visiblePrograms, program));
    }

    blocks.push(
      ...(activeTab === "overview"
        ? overviewBlocks(program, userId)
        : await mineBlocks(userId, program))
    );
  }

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

  app.action("home_tab_admin", async ({ ack, body }) => {
    await ack();
    if (!isSuperAdmin(body.user.id)) return;
    await publishHomeView(body.user.id, "admin");
  });

  app.action("select_program", async ({ ack, body, action }) => {
    await ack();
    if (action.type !== "static_select") return;
    await publishHomeView(body.user.id, undefined, Number(action.selected_option.value));
  });

  // Buttons with a `url` still fire an interaction payload -- just ack it, Slack opens the link itself.
  app.action("view_assigned_ticket", async ({ ack }) => {
    await ack();
  });
}
