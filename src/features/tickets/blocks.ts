import type { KnownBlock } from "@slack/bolt";
import { config } from "../../config";
import type { Ticket } from "../../db/tickets";

const USER_INFO_ACTION_ID = "user_info_overflow";

/** Tiny, staff-only overflow menu tucked onto a section, opens the user-info modal. */
function staffOverflowAccessory(ticket: Ticket) {
  return {
    type: "overflow" as const,
    action_id: USER_INFO_ACTION_ID,
    options: [
      {
        text: { type: "plain_text" as const, text: "🔎 Support Scouts only" },
        value: String(ticket.id),
      },
    ],
  };
}

/** The bot's initial threaded reply: a greeting, the FAQ nudge, and (while open) the Resolve button. */
export function buildTicketIntroBlocks(ticket: Ticket, openerName: string): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Hey ${openerName}! Thanks for reaching out, a helper will be along shortly.`,
      },
      accessory: staffOverflowAccessory(ticket),
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `While you wait, take a peek at our <${config.faqCanvasUrl}|FAQ>, it answers most of the questions we get.`,
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
          text: { type: "plain_text", text: "I get it now", emoji: true },
          style: "primary",
          action_id: "resolve_ticket",
          value: String(ticket.id),
        },
      ],
    });
  }

  return blocks;
}

/**
 * A fresh message announcing the ticket was resolved. If the ticket has a
 * `resolution_note` (set when closed with a canned reason), that text is used
 * verbatim instead of the default "resolved by X" line, so it never names
 * whoever clicked the canned option. The Reopen button is optional so a past
 * announcement can be left as read-only history.
 */
export function buildResolvedAnnouncementBlocks(
  ticket: Ticket,
  { withReopenButton = true }: { withReopenButton?: boolean } = {}
): KnownBlock[] {
  const text =
    ticket.resolution_note ??
    `This ticket has just been marked as resolved by <@${ticket.resolved_by}>! 🎉 More questions? Send another message in <#${ticket.channel_id}>, we're more than happy to help you out.`;

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text },
    },
  ];

  if (withReopenButton) {
    blocks.push({
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
    });
  }

  return blocks;
}

/** A brand new message announcing the ticket was reopened. */
export function buildReopenedAnnouncementBlocks(reopenedBy: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `This ticket has been reopened by <@${reopenedBy}>! We're back on it.`,
      },
    },
  ];
}
