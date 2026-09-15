import { app } from "../../slack/app";
import { claimTicket, getTicketByMessageTs } from "../../db/tickets";
import { isHelper } from "../../slack/helpers";

const ASSIGN_RESPONSES = [
  "assigned to you! go get 'em.",
  "it's yours now, good luck!",
  "claimed, this one's on you.",
  "you've got this one, nice.",
  "locked in, it's yours.",
];

function randomResponse(): string {
  return ASSIGN_RESPONSES[Math.floor(Math.random() * ASSIGN_RESPONSES.length)];
}

/** The "assign to me" message shortcut, available from the "..." menu on any message in a ticket's thread. */
export function registerAssignShortcut(): void {
  app.shortcut("assign_ticket_to_me", async ({ shortcut, ack, client }) => {
    await ack();

    if (shortcut.type !== "message_action") return;

    const channelId = shortcut.channel.id;
    const keyTs = shortcut.message.thread_ts ?? shortcut.message.ts;
    const ticket = getTicketByMessageTs(channelId, keyTs);

    if (!ticket) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: shortcut.user.id,
        text: "Couldn't find a ticket for that message.",
      });
      return;
    }

    if (!(await isHelper(shortcut.user.id))) {
      await client.chat.postEphemeral({
        channel: channelId,
        thread_ts: ticket.message_ts,
        user: shortcut.user.id,
        text: "This one's for the support team only, sneaky :3",
      });
      return;
    }

    claimTicket(ticket.id, shortcut.user.id);

    await client.chat.postEphemeral({
      channel: channelId,
      thread_ts: ticket.message_ts,
      user: shortcut.user.id,
      text: randomResponse(),
    });
  });
}
