import type { KnownBlock } from "@slack/bolt";
import { config } from "../../config";
import type { Ticket } from "../../db/tickets";

export function buildTicketBlocks(ticket: Ticket): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:tickets: *${ticket.subject}*\nOpened by <@${ticket.opener_id}>${
          ticket.description ? `\n\n${ticket.description}` : ""
        }`,
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
        {
          type: "button",
          text: { type: "plain_text", text: "📖 View FAQ", emoji: true },
          action_id: "view_faq",
          url: config.faqCanvasUrl,
        },
      ],
    });
  } else {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:white_check_mark: Resolved by <@${ticket.resolved_by}>`,
        },
      ],
    });
  }

  return blocks;
}
