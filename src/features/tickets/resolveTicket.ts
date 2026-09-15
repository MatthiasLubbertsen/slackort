import { app } from "../../slack/app";
import { getTicketById, resolveTicket, reopenTicket, setResolutionTs } from "../../db/tickets";
import { canResolve } from "../../slack/helpers";
import { getFriendlyName } from "../../slack/userName";
import {
  buildTicketIntroBlocks,
  buildResolvedAnnouncementBlocks,
  buildReopenedAnnouncementBlocks,
} from "./blocks";

export function registerResolveTicket(): void {
  app.action("resolve_ticket", async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "button" || !("value" in action) || !action.value) return;
    if (body.type !== "block_actions" || !body.channel) return;

    const ticketId = Number(action.value);
    const ticket = getTicketById(ticketId);
    if (!ticket) return;

    if (ticket.status === "resolved") {
      await client.chat.postEphemeral({
        channel: body.channel.id!,
        user: body.user.id,
        text: "That ticket's already resolved :white_check_mark:",
      });
      return;
    }

    const allowed = await canResolve(body.user.id, ticket.opener_id);
    if (!allowed) {
      await client.chat.postEphemeral({
        channel: body.channel.id!,
        user: body.user.id,
        text: "Only the ticket opener or a support helper can resolve this one.",
      });
      return;
    }

    const updated = resolveTicket(ticket.id, body.user.id);

    // The Resolve button disappears from the original threaded reply.
    if (updated.reply_ts) {
      const openerName = await getFriendlyName(client, updated.opener_id);
      await client.chat.update({
        channel: updated.channel_id,
        ts: updated.reply_ts,
        text: `Hey ${openerName}, a helper will be along shortly.`,
        blocks: buildTicketIntroBlocks(updated, openerName),
      });
    }

    // A fresh message announces the resolution, with a Reopen button.
    const announcement = await client.chat.postMessage({
      channel: updated.channel_id,
      thread_ts: updated.message_ts,
      text: `This ticket has just been marked as resolved by <@${updated.resolved_by}>!`,
      blocks: buildResolvedAnnouncementBlocks(updated),
    });
    setResolutionTs(updated.id, announcement.ts as string);

    await client.reactions
      .remove({
        channel: updated.channel_id,
        timestamp: updated.message_ts,
        name: "thinking_face",
      })
      .catch(() => {
        // reaction may already be gone, that's fine
      });

    await client.reactions.add({
      channel: updated.channel_id,
      timestamp: updated.message_ts,
      name: "white_check_mark",
    });
  });

  app.action("reopen_ticket", async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "button" || !("value" in action) || !action.value) return;
    if (body.type !== "block_actions" || !body.channel) return;

    const ticketId = Number(action.value);
    const ticket = getTicketById(ticketId);
    if (!ticket) return;

    if (ticket.status === "open") {
      await client.chat.postEphemeral({
        channel: body.channel.id!,
        user: body.user.id,
        text: "That ticket's already open :thinking_face:",
      });
      return;
    }

    // Opener or helper, same as resolving.
    const allowed = await canResolve(body.user.id, ticket.opener_id);
    if (!allowed) {
      await client.chat.postEphemeral({
        channel: body.channel.id!,
        user: body.user.id,
        text: "Only the ticket opener or a support helper can reopen this one.",
      });
      return;
    }

    const reopenedByUserId = body.user.id;

    // The old resolution announcement just loses its Reopen button -- its
    // "resolved by X" text stays put as history, nothing else about it changes.
    if (ticket.resolution_ts) {
      await client.chat.update({
        channel: ticket.channel_id,
        ts: ticket.resolution_ts,
        text: `This ticket was marked as resolved by <@${ticket.resolved_by}>.`,
        blocks: buildResolvedAnnouncementBlocks(ticket, { withReopenButton: false }),
      });
    }

    const updated = reopenTicket(ticket.id);
    setResolutionTs(updated.id, null);

    // Restore the Resolve button on the original threaded reply.
    if (updated.reply_ts) {
      const openerName = await getFriendlyName(client, updated.opener_id);
      await client.chat.update({
        channel: updated.channel_id,
        ts: updated.reply_ts,
        text: `Hey ${openerName}, a helper will be along shortly.`,
        blocks: buildTicketIntroBlocks(updated, openerName),
      });
    }

    // A brand new message announces the reopen, separate from the old one.
    await client.chat.postMessage({
      channel: updated.channel_id,
      thread_ts: updated.message_ts,
      text: `This ticket has been reopened by <@${reopenedByUserId}>!`,
      blocks: buildReopenedAnnouncementBlocks(reopenedByUserId),
    });

    await client.reactions
      .remove({
        channel: updated.channel_id,
        timestamp: updated.message_ts,
        name: "white_check_mark",
      })
      .catch(() => {
        // reaction may already be gone, that's fine
      });

    await client.reactions.add({
      channel: updated.channel_id,
      timestamp: updated.message_ts,
      name: "thinking_face",
    });
  });
}
