import { app } from "../../slack/app";
import { db } from "../../db";
import { resolveTicket, type Ticket } from "../../db/tickets";
import { canResolve } from "../../slack/helpers";
import { buildTicketBlocks } from "./blocks";

export function registerResolveTicket(): void {
  app.action("resolve_ticket", async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "button" || !("value" in action) || !action.value) return;
    if (body.type !== "block_actions" || !body.message) return;

    const ticketId = Number(action.value);
    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as
      | Ticket
      | undefined;

    if (!ticket) return;

    if (ticket.status === "resolved") {
      await client.chat.postEphemeral({
        channel: body.channel!.id!,
        user: body.user.id,
        text: "That ticket's already resolved :white_check_mark:",
      });
      return;
    }

    const allowed = await canResolve(body.user.id, ticket.opener_id);
    if (!allowed) {
      await client.chat.postEphemeral({
        channel: body.channel!.id!,
        user: body.user.id,
        text: "Only the ticket opener or a support helper can resolve this one.",
      });
      return;
    }

    const updated = resolveTicket(ticket.id, body.user.id);

    await client.chat.update({
      channel: ticket.channel_id,
      ts: ticket.message_ts,
      text: `Ticket resolved: ${ticket.subject}`,
      blocks: buildTicketBlocks(updated),
    });

    await client.reactions.remove({
      channel: ticket.channel_id,
      timestamp: ticket.message_ts,
      name: "thinking_face",
    }).catch(() => {
      // reaction may already be gone, that's fine
    });

    await client.reactions.add({
      channel: ticket.channel_id,
      timestamp: ticket.message_ts,
      name: "white_check_mark",
    });
  });
}
