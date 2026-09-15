import type { KnownBlock, ModalView } from "@slack/bolt";
import { app } from "../../slack/app";
import { config } from "../../config";
import {
  getTicketById,
  deleteTicket,
  resolveTicket,
  setResolutionTs,
  ticketStatsForUser,
} from "../../db/tickets";
import type { Ticket } from "../../db/tickets";
import { isHelper } from "../../slack/helpers";
import { getFriendlyName } from "../../slack/userName";
import { buildResolvedAnnouncementBlocks, buildTicketIntroBlocks } from "./blocks";
import { CANNED_CLOSE_REASONS, findCannedCloseReason } from "./cannedCloseReasons";

function infoModalView(ticket: Ticket, openerName: string): ModalView {
  const stats = ticketStatsForUser(ticket.opener_id);
  const adminUrl = `${config.stardanceAdminUrl}?query=${encodeURIComponent(ticket.opener_id)}`;

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
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open in Stardance admin", emoji: true },
          url: adminUrl,
          action_id: "open_stardance_admin",
        },
      ],
    },
  ];

  if (ticket.status === "open") {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Quick close*, posts as Hestia, no ping." },
      },
      {
        type: "actions",
        elements: [
          ...CANNED_CLOSE_REASONS.map((reason) => ({
            type: "button" as const,
            text: { type: "plain_text" as const, text: reason.label, emoji: true },
            action_id: "close_with_reason",
            value: `${ticket.id}:${reason.key}`,
          })),
          {
            type: "button" as const,
            text: { type: "plain_text" as const, text: "🧹 Wipe thread", emoji: true },
            style: "danger" as const,
            action_id: "wipe_thread",
            value: String(ticket.id),
            confirm: {
              title: { type: "plain_text" as const, text: "Wipe this thread?" },
              text: {
                type: "mrkdwn" as const,
                text: "Deletes Hestia's messages and reactions in this thread and removes the ticket record. This can't be undone.",
              },
              confirm: { type: "plain_text" as const, text: "Wipe it" },
              deny: { type: "plain_text" as const, text: "Never mind" },
            },
          },
        ],
      }
    );
  }

  return {
    type: "modal",
    title: { type: "plain_text", text: "User info" },
    close: { type: "plain_text", text: "Close" },
    blocks,
  };
}

function doneView(title: string, text: string): ModalView {
  return {
    type: "modal",
    title: { type: "plain_text", text: title },
    close: { type: "plain_text", text: "Done" },
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

    const allowed = await isHelper(body.user.id);
    if (!allowed) {
      await client.chat.postEphemeral({
        channel: ticket.channel_id,
        thread_ts: ticket.message_ts,
        user: body.user.id,
        text: "This one's for the support team only, sneaky :3",
      });
      return;
    }

    const openerName = await getFriendlyName(client, ticket.opener_id);
    await client.views.open({
      trigger_id: body.trigger_id,
      view: infoModalView(ticket, openerName),
    });
  });

  // Buttons with a `url` still fire an interaction payload -- just ack it, Slack opens the link itself.
  app.action("open_stardance_admin", async ({ ack }) => {
    await ack();
  });

  app.action("close_with_reason", async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "button" || !action.value) return;
    if (body.type !== "block_actions" || !body.view) return;

    const [ticketIdRaw, reasonKey] = action.value.split(":");
    const ticket = getTicketById(Number(ticketIdRaw));
    const reason = findCannedCloseReason(reasonKey);
    if (!ticket || !reason) return;

    if (!(await isHelper(body.user.id))) return;

    if (ticket.status === "resolved") {
      await client.views.update({
        view_id: body.view.id,
        view: doneView("Already resolved", "This ticket's already resolved :white_check_mark:"),
      });
      return;
    }

    const updated = resolveTicket(ticket.id, body.user.id, reason.message);

    if (updated.reply_ts) {
      const openerName = await getFriendlyName(client, updated.opener_id);
      await client.chat.update({
        channel: updated.channel_id,
        ts: updated.reply_ts,
        text: `Hey ${openerName}, a helper will be along shortly.`,
        blocks: buildTicketIntroBlocks(updated, openerName),
      });
    }

    const announcement = await client.chat.postMessage({
      channel: updated.channel_id,
      thread_ts: updated.message_ts,
      text: reason.message,
      blocks: buildResolvedAnnouncementBlocks(updated),
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

    await client.views.update({
      view_id: body.view.id,
      view: doneView("Closed", `Closed with the *${reason.label}* reason. 🎉`),
    });
  });

  app.action("wipe_thread", async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "button" || !action.value) return;
    if (body.type !== "block_actions" || !body.view) return;

    const ticket = getTicketById(Number(action.value));
    if (!ticket) return;
    if (!(await isHelper(body.user.id))) return;

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
      view: doneView("Wiped", "🧹 Thread wiped, no trace of Hestia left behind."),
    });
  });
}
