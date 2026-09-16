import type { KnownBlock } from "@slack/bolt";
import type { Ticket } from "../../db/tickets";
import type { Program } from "../../db/programs";

const USER_INFO_ACTION_ID = "user_info_overflow";

const DEFAULT_WELCOME_MESSAGE = "Hey {name}! Thanks for reaching out, a helper will be along shortly.";

function renderWelcomeMessage(program: Program, openerName: string): string {
  const template = program.welcome_message ?? DEFAULT_WELCOME_MESSAGE;
  return template.replaceAll("{name}", openerName);
}

/** Tiny, staff-only overflow menu tucked onto a section, opens the user-info modal. */
function staffOverflowAccessory(ticket: Ticket) {
  return {
    type: "overflow" as const,
    action_id: USER_INFO_ACTION_ID,
    options: [
      {
        text: { type: "plain_text" as const, text: "Support Scouts only" },
        value: String(ticket.id),
      },
    ],
  };
}

/** The bot's initial threaded reply: a greeting, the FAQ nudge, and (while open) the Resolve button. */
export function buildTicketIntroBlocks(
  ticket: Ticket,
  program: Program,
  openerName: string
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: renderWelcomeMessage(program, openerName) },
      accessory: staffOverflowAccessory(ticket),
    },
  ];

  if (program.faq_url) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `While you wait, take a peek at our <${program.faq_url}|FAQ>, it answers most of the questions we get.`,
      },
    });
  }

  if (ticket.status === "open") {
    blocks.push({
      type: "actions",
      block_id: "ticket_actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "i get it now" },
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
    `This ticket has just been marked as resolved by <@${ticket.resolved_by}>! More questions? Send another message in <#${ticket.channel_id}>, we're more than happy to help you out.`;

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
          text: { type: "plain_text", text: "reopen" },
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
