import { app } from "../../slack/app";
import { getTicketById, resolveTicket } from "../../db/tickets";
import { canResolve } from "../../slack/helpers";
import { buildTicketReplyBlocks } from "./blocks";

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

    if (updated.reply_ts) {
      await client.chat.update({
        channel: updated.channel_id,
        ts: updated.reply_ts,
        text: `Ticket resolved: ${updated.subject}`,
        blocks: buildTicketReplyBlocks(updated),
      });
    }

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

  // Buttons with a `url` still fire an interaction payload -- just ack it, Slack opens the link itself.
  app.action("view_faq", async ({ ack }) => {
    await ack();
  });
}
