import { app } from "../../slack/app";
import { config } from "../../config";
import { getTicketById, ticketStatsForUser } from "../../db/tickets";
import { isHelper } from "../../slack/helpers";
import { getFriendlyName } from "../../slack/userName";

export function registerUserInfoModal(): void {
  app.action("user_info_overflow", async ({ ack, body, client, action }) => {
    await ack();

    if (action.type !== "overflow") return;
    if (body.type !== "block_actions" || !body.trigger_id) return;

    const ticketId = Number(action.selected_option.value);
    const ticket = getTicketById(ticketId);
    if (!ticket) return;

    const allowed = await isHelper(body.user.id);
    if (!allowed) {
      if (body.channel) {
        await client.chat.postEphemeral({
          channel: body.channel.id!,
          user: body.user.id,
          text: "This one's for the support team only, sneaky :3",
        });
      }
      return;
    }

    const openerName = await getFriendlyName(client, ticket.opener_id);
    const stats = ticketStatsForUser(ticket.opener_id);
    const adminUrl = `${config.stardanceAdminUrl}?query=${encodeURIComponent(ticket.opener_id)}`;

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "User info" },
        close: { type: "plain_text", text: "Close" },
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${openerName}*\n<@${ticket.opener_id}>` },
          },
          { type: "divider" },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🎫 *Tickets opened:* ${stats.total}\n✅ *Resolved:* ${stats.resolved}\n🕓 *Currently open:* ${stats.open}`,
            },
          },
          { type: "divider" },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Open in Stardance admin", emoji: true },
                url: adminUrl,
                action_id: "open_stardance_admin",
              },
            ],
          },
        ],
      },
    });
  });

  // Buttons with a `url` still fire an interaction payload -- just ack it, Slack opens the link itself.
  app.action("open_stardance_admin", async ({ ack }) => {
    await ack();
  });
}
