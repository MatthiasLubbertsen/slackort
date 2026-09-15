import type { KnownBlock } from "@slack/bolt";
import { config } from "../../config";
import type { Ticket } from "../../db/tickets";

/** The bot's initial threaded reply: a greeting, the FAQ nudge, and (while open) the Resolve button. */
export function buildTicketIntroBlocks(ticket: Ticket, openerName: string): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Hi ${openerName}, thanks for reaching out! A helper will be with you shortly.`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Make sure you've read our <${config.faqCanvasUrl}|FAQ>, it answers most of the questions.`,
      },
    },
  ];

  if (ticket.status === "open") {
    blocks.push({
      type: "actions",
      block_id: "ticket_actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Resolve", emoji: true },
          style: "primary",
          action_id: "resolve_ticket",
          value: String(ticket.id),
        },
      ],
    });
  }

  return blocks;
}

/** A fresh message announcing the ticket was resolved, with a Reopen button. */
export function buildResolvedAnnouncementBlocks(ticket: Ticket): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `This post has just been marked as resolved by <@${ticket.resolved_by}>! More questions? Send another message in <#${ticket.channel_id}>, we're more than happy to help you out.`,
      },
    },
    {
      type: "actions",
      block_id: "resolution_actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "↩️ Reopen", emoji: true },
          action_id: "reopen_ticket",
          value: String(ticket.id),
        },
      ],
    },
  ];
}

/** What the resolved-announcement message becomes once someone reopens the ticket. */
export function buildReopenedAnnouncementBlocks(reopenedBy: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `This ticket was reopened by <@${reopenedBy}>.`,
      },
    },
  ];
}
