import type { KnownBlock } from "@slack/bolt";
import { config } from "../../config";
import type { Ticket } from "../../db/tickets";

/** Blocks for the bot's threaded reply under a ticket message. */
export function buildTicketReplyBlocks(ticket: Ticket): KnownBlock[] {
  if (ticket.status === "open") {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:tickets: Ticket opened by <@${ticket.opener_id}>. A helper will be with you shortly — reply in this thread, then hit *Resolve* once it's sorted.`,
        },
      },
      {
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
          {
            type: "button",
            text: { type: "plain_text", text: "📖 View FAQ", emoji: true },
            action_id: "view_faq",
            url: config.faqCanvasUrl,
          },
        ],
      },
    ];
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:tickets: Ticket opened by <@${ticket.opener_id}>.`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:white_check_mark: Resolved by <@${ticket.resolved_by}>`,
        },
      ],
    },
  ];
}
