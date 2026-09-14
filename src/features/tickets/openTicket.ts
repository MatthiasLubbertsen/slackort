import { app } from "../../slack/app";
import { config } from "../../config";
import { createTicket } from "../../db/tickets";
import { buildTicketBlocks } from "./blocks";

const TICKET_MODAL_CALLBACK_ID = "ticket_modal";

export function registerOpenTicket(): void {
  app.command("/ticket", async ({ ack, body, client }) => {
    await ack();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: TICKET_MODAL_CALLBACK_ID,
        title: { type: "plain_text", text: "Open a support ticket" },
        submit: { type: "plain_text", text: "Submit" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "subject_block",
            label: { type: "plain_text", text: "What's up?" },
            element: {
              type: "plain_text_input",
              action_id: "subject_input",
              placeholder: { type: "plain_text", text: "Short summary of the issue" },
            },
          },
          {
            type: "input",
            block_id: "description_block",
            optional: true,
            label: { type: "plain_text", text: "Details" },
            element: {
              type: "plain_text_input",
              action_id: "description_input",
              multiline: true,
              placeholder: { type: "plain_text", text: "Anything that'll help us help you" },
            },
          },
        ],
      },
    });
  });

  app.view(TICKET_MODAL_CALLBACK_ID, async ({ ack, view, body, client }) => {
    await ack();

    const subject = view.state.values.subject_block.subject_input.value ?? "Untitled ticket";
    const description = view.state.values.description_block.description_input.value ?? undefined;
    const openerId = body.user.id;

    const posted = await client.chat.postMessage({
      channel: config.supportChannelId,
      text: `New ticket from <@${openerId}>: ${subject}`,
      blocks: buildTicketBlocks({
        id: -1,
        channel_id: config.supportChannelId,
        message_ts: "",
        opener_id: openerId,
        subject,
        description: description ?? null,
        status: "open",
        created_at: Date.now(),
        resolved_at: null,
        resolved_by: null,
      }),
    });

    const messageTs = posted.ts as string;

    createTicket({
      channelId: config.supportChannelId,
      messageTs,
      openerId,
      subject,
      description,
    });

    await client.reactions.add({
      channel: config.supportChannelId,
      timestamp: messageTs,
      name: "thinking_face",
    });
  });

  // Buttons with a `url` still fire an interaction payload -- just ack it, Slack opens the link itself.
  app.action("view_faq", async ({ ack }) => {
    await ack();
  });
}
