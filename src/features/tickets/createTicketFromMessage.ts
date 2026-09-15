import { app } from "../../slack/app";
import { config } from "../../config";
import {
  claimTicket,
  createTicket,
  getOpenTicketForUser,
  getTicketByMessageTs,
  setReplyTs,
} from "../../db/tickets";
import { buildTicketIntroBlocks } from "./blocks";
import { getFriendlyName } from "../../slack/userName";
import { isHelper } from "../../slack/helpers";

const SUBJECT_MAX_LENGTH = 120;

function subjectFromText(text: string | undefined): string {
  if (!text) return "(no message text)";
  const firstLine = text.split("\n")[0].trim();
  if (!firstLine) return "(attachment)";
  return firstLine.length > SUBJECT_MAX_LENGTH
    ? `${firstLine.slice(0, SUBJECT_MAX_LENGTH - 1)}…`
    : firstLine;
}

export function registerCreateTicketFromMessage(): void {
  app.message(async ({ message, client }) => {
    if (message.channel !== config.supportChannelId) return;
    if (message.channel_type !== "channel" && message.channel_type !== "group") return;

    // Skip edits/deletes/joins/bot posts.
    if ("subtype" in message && message.subtype && message.subtype !== "file_share") return;
    if ("bot_id" in message && message.bot_id) return;
    if (!("user" in message) || !message.user) return;

    const senderId = message.user;
    const threadTs = "thread_ts" in message ? message.thread_ts : undefined;

    if (threadTs && threadTs !== message.ts) {
      // A reply in some ticket's thread -- if nobody's claimed it yet and this
      // is a helper jumping in, that's the claim. Doesn't open a new ticket.
      const ticket = getTicketByMessageTs(message.channel, threadTs);
      if (ticket && ticket.status === "open" && !ticket.assigned_to && (await isHelper(senderId))) {
        claimTicket(ticket.id, senderId);
      }
      return;
    }

    const openerId = senderId;

    // Someone posting again shortly after opening a ticket is almost always an
    // accidental double-post (they hit enter twice, or split their message across
    // a couple of lines). Only redirect within that window -- after it, this is
    // probably a genuinely separate issue, so let it become its own ticket.
    const existingTicket = getOpenTicketForUser(message.channel, openerId);
    if (existingTicket && Date.now() - existingTicket.created_at < config.duplicateWindowMs) {
      const permalink = await client.chat
        .getPermalink({ channel: existingTicket.channel_id, message_ts: existingTicket.message_ts })
        .then((r) => r.permalink)
        .catch(() => undefined);
      const threadRef = permalink ? `<${permalink}|in that thread>` : "in your existing thread";

      await client.chat.postEphemeral({
        channel: message.channel,
        thread_ts: message.ts,
        user: openerId,
        text: `Hey <@${openerId}>, you've already got a ticket open, please continue ${threadRef} instead! Closing this one so it doesn't clutter the queue.`,
      });

      await client.reactions.add({
        channel: message.channel,
        timestamp: message.ts,
        name: "white_check_mark",
      });
      return;
    }

    const openerName = await getFriendlyName(client, openerId);
    const subject = subjectFromText("text" in message ? message.text : undefined);

    await client.reactions.add({
      channel: message.channel,
      timestamp: message.ts,
      name: "thinking_face",
    });

    const ticket = createTicket({
      channelId: message.channel,
      messageTs: message.ts,
      openerId,
      subject,
    });

    const reply = await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.ts,
      text: `Hey ${openerName}, a helper will be along shortly.`,
      blocks: buildTicketIntroBlocks(ticket, openerName),
    });

    setReplyTs(ticket.id, reply.ts as string);
  });
}
