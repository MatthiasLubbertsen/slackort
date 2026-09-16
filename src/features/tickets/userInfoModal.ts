import type { KnownBlock, ModalView } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import {
  getTicketById,
  deleteTicket,
  resolveTicket,
  setResolutionTs,
  ticketStatsForUser,
} from "../../db/tickets";
import type { Ticket } from "../../db/tickets";
import { getProgramById, type Program } from "../../db/programs";
import { listProgramShortcuts, findProgramShortcutByKey } from "../../db/programShortcuts";
import { app } from "../../slack/app";
import { isUsergroupMember } from "../../slack/helpers";
import { getFriendlyName } from "../../slack/userName";
import { buildResolvedAnnouncementBlocks, buildTicketIntroBlocks } from "./blocks";

async function infoModalView(client: WebClient, ticket: Ticket, program: Program): Promise<ModalView> {
  const openerName = await getFriendlyName(client, ticket.opener_id);
  const stats = ticketStatsForUser(ticket.opener_id, program.id);

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${openerName}*\n<@${ticket.opener_id}>` },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🎫 *Tickets opened:* ${stats.total}\n✅ *Resolved:* ${stats.resolved}\n🕓 *Currently open:* ${stats.open}`,
      },
    },
  ];

  if (program.admin_url_template) {
    const adminUrl = `${program.admin_url_template}?query=${encodeURIComponent(ticket.opener_id)}`;
    blocks.push(
      { type: "divider" },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "open in stardance admin" },
            url: adminUrl,
            action_id: "open_stardance_admin",
          },
        ],
      }
    );
  }

  if (ticket.status === "open") {
    const assignedLine = ticket.assigned_to
      ? `Assigned to <@${ticket.assigned_to}>. Reply in the thread or use the "assign to me" shortcut on a message to take over.`
      : `Unclaimed, whoever replies in the thread first (or uses the "assign to me" shortcut) gets it.`;

    const shortcuts = listProgramShortcuts(program.id);

    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: assignedLine },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Quick close*, posts as Hestia, no ping." },
      },
      {
        type: "actions",
        elements: [
          ...shortcuts.map((shortcut) => ({
            type: "button" as const,
            text: { type: "plain_text" as const, text: shortcut.label },
            action_id: `close_with_reason:${shortcut.key}`,
            value: String(ticket.id),
          })),
          {
            type: "button" as const,
            text: { type: "plain_text" as const, text: "wipe thread" },
            style: "danger" as const,
            action_id: "wipe_thread",
            value: String(ticket.id),
          },
        ],
      }
    );
  }

  return {
    type: "modal",
    title: { type: "plain_text", text: "User info" },
    close: { type: "plain_text", text: "close" },
    blocks,
  };
}

function terminalView(title: string, text: string): ModalView {
  return {
    type: "modal",
    title: { type: "plain_text", text: title },
    close: { type: "plain_text", text: "close" },
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  };
}

export function registerUserInfoModal(): void {
  app.action("user_info_overflow", async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "overflow") return;
    if (body.type !== "block_actions" || !body.trigger_id) return;

    const ticketId = Number(action.selected_option.value);
    const ticket = getTicketById(ticketId);
    if (!ticket) return;
    const program = getProgramById(ticket.program_id);
    if (!program) return;

    const allowed = await isUsergroupMember(body.user.id, program.usergroup_id);
    if (!allowed) {
      await client.chat.postEphemeral({
        channel: ticket.channel_id,
        thread_ts: ticket.message_ts,
        user: body.user.id,
        text: "This one's for the support team only, sneaky :3",
      });
      return;
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: await infoModalView(client, ticket, program),
    });
  });

  // Buttons with a `url` still fire an interaction payload -- just ack it, Slack opens the link itself.
  app.action("open_stardance_admin", async ({ ack }) => {
    await ack();
  });

  app.action(/^close_with_reason:/, async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "button" || !action.value) return;
    if (body.type !== "block_actions" || !body.view) return;

    const actionId = body.actions[0].action_id;
    const reasonKey = actionId.slice("close_with_reason:".length);
    const ticket = getTicketById(Number(action.value));
    if (!ticket) return;
    const program = getProgramById(ticket.program_id);
    if (!program) return;
    const shortcut = findProgramShortcutByKey(program.id, reasonKey);
    if (!shortcut) return;

    if (!(await isUsergroupMember(body.user.id, program.usergroup_id))) return;

    if (ticket.status === "resolved") {
      await client.views.update({
        view_id: body.view.id,
        view: terminalView("Already resolved", "This ticket's already resolved :white_check_mark:"),
      });
      return;
    }

    const updated = resolveTicket(ticket.id, body.user.id, shortcut.message);

    if (updated.reply_ts) {
      const openerName = await getFriendlyName(client, updated.opener_id);
      await client.chat.update({
        channel: updated.channel_id,
        ts: updated.reply_ts,
        text: `Hey ${openerName}, a helper will be along shortly.`,
        blocks: buildTicketIntroBlocks(updated, program, openerName),
      });
    }

    const announcement = await client.chat.postMessage({
      channel: updated.channel_id,
      thread_ts: updated.message_ts,
      text: shortcut.message,
      blocks: buildResolvedAnnouncementBlocks(updated, { withReopenButton: false }),
    });
    setResolutionTs(updated.id, announcement.ts as string);

    await client.reactions
      .remove({ channel: updated.channel_id, timestamp: updated.message_ts, name: "thinking_face" })
      .catch(() => {});
    await client.reactions.add({
      channel: updated.channel_id,
      timestamp: updated.message_ts,
      name: "white_check_mark",
    });

    // Refresh in place, the quick-close section drops out on its own since the ticket's no longer open.
    await client.views.update({
      view_id: body.view.id,
      view: await infoModalView(client, updated, program),
    });
  });

  app.action("wipe_thread", async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "button" || !action.value) return;
    if (body.type !== "block_actions" || !body.view) return;

    const ticket = getTicketById(Number(action.value));
    if (!ticket) return;
    const program = getProgramById(ticket.program_id);
    if (!program) return;
    if (!(await isUsergroupMember(body.user.id, program.usergroup_id))) return;

    if (ticket.reply_ts) {
      await client.chat.delete({ channel: ticket.channel_id, ts: ticket.reply_ts }).catch(() => {});
    }
    if (ticket.resolution_ts) {
      await client.chat
        .delete({ channel: ticket.channel_id, ts: ticket.resolution_ts })
        .catch(() => {});
    }
    for (const name of ["thinking_face", "white_check_mark"]) {
      await client.reactions
        .remove({ channel: ticket.channel_id, timestamp: ticket.message_ts, name })
        .catch(() => {});
    }

    deleteTicket(ticket.id);

    await client.views.update({
      view_id: body.view.id,
      view: terminalView("Wiped", "Thread wiped, no trace of Hestia left behind."),
    });
  });
}
