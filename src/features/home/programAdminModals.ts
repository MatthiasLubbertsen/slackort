import type { KnownBlock, ModalView } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { app } from "../../slack/app";
import {
  createProgram,
  getProgramById,
  isSuperAdmin,
  updateProgram,
  type Program,
} from "../../db/programs";
import {
  addQuickReply,
  deleteQuickReply,
  getQuickReply,
  listQuickReplies,
  updateQuickReply,
} from "../../db/quickReplies";
import { publishHomeView } from "./publishHome";

const PROGRAM_MODAL = "program_modal";
const PROGRAM_SETTINGS_MODAL = "program_settings_modal";
const QUICK_REPLY_FORM_MODAL = "quick_reply_form_modal";

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("UNIQUE constraint failed");
}

async function usergroupOptions(client: WebClient) {
  const result = await client.usergroups.list({});
  return (result.usergroups ?? []).map((ug) => ({
    text: { type: "plain_text" as const, text: `${ug.name} (@${ug.handle})` },
    value: ug.id!,
  }));
}

async function buildProgramModal(client: WebClient, program?: Program): Promise<ModalView> {
  const options = await usergroupOptions(client);
  const currentOption = program
    ? options.find((o) => o.value === program.usergroup_id)
    : undefined;

  return {
    type: "modal",
    callback_id: PROGRAM_MODAL,
    private_metadata: JSON.stringify({ programId: program?.id }),
    title: { type: "plain_text", text: program ? "edit program" : "add program" },
    submit: { type: "plain_text", text: "save" },
    close: { type: "plain_text", text: "cancel" },
    blocks: [
      {
        type: "input",
        block_id: "name_block",
        label: { type: "plain_text", text: "Program name" },
        element: {
          type: "plain_text_input",
          action_id: "name_input",
          initial_value: program?.name,
          placeholder: { type: "plain_text", text: "e.g. Hackatime" },
        },
      },
      {
        type: "input",
        block_id: "help_channel_block",
        label: { type: "plain_text", text: "Help channel" },
        element: {
          type: "conversations_select",
          action_id: "help_channel_input",
          initial_conversation: program?.help_channel_id,
          filter: { include: ["public", "private"] },
        },
      },
      {
        type: "input",
        block_id: "bts_channel_block",
        label: { type: "plain_text", text: "BTS channel (daily summaries go here)" },
        element: {
          type: "conversations_select",
          action_id: "bts_channel_input",
          initial_conversation: program?.bts_channel_id,
          filter: { include: ["public", "private"] },
        },
      },
      {
        type: "input",
        block_id: "usergroup_block",
        label: { type: "plain_text", text: "Helper user group" },
        element: {
          type: "static_select",
          action_id: "usergroup_input",
          options,
          ...(currentOption && { initial_option: currentOption }),
        },
      },
      {
        type: "input",
        block_id: "admin_block",
        label: { type: "plain_text", text: "Program admin (can edit its messages and quick replies)" },
        element: {
          type: "users_select",
          action_id: "admin_input",
          initial_user: program?.admin_user_id,
        },
      },
    ],
  };
}

function quickRepliesListView(program: Program): ModalView {
  const quickReplies = listQuickReplies(program.id);

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `Quick replies for *${program.name}*, posts as Hestia, no ping.` },
    },
    { type: "divider" },
  ];

  if (quickReplies.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_no quick replies yet_" },
    });
  }

  for (const reply of quickReplies) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${reply.label}*\n${reply.message}` },
      accessory: {
        type: "overflow",
        action_id: `quick_reply_row_actions:${reply.id}`,
        options: [
          { text: { type: "plain_text", text: "edit" }, value: "edit" },
          { text: { type: "plain_text", text: "delete" }, value: "delete" },
        ],
      },
    });
  }

  blocks.push(
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "add quick reply" },
          action_id: `add_quick_reply:${program.id}`,
          value: String(program.id),
        },
      ],
    }
  );

  return {
    type: "modal",
    title: { type: "plain_text", text: "Quick replies" },
    close: { type: "plain_text", text: "close" },
    blocks,
  };
}

function quickReplyFormModal(programId: number, quickReplyId?: number): ModalView {
  const reply = quickReplyId ? getQuickReply(quickReplyId) : undefined;

  return {
    type: "modal",
    callback_id: QUICK_REPLY_FORM_MODAL,
    private_metadata: JSON.stringify({ programId, quickReplyId }),
    title: { type: "plain_text", text: reply ? "edit quick reply" : "add quick reply" },
    submit: { type: "plain_text", text: "save" },
    close: { type: "plain_text", text: "cancel" },
    blocks: [
      {
        type: "input",
        block_id: "label_block",
        label: { type: "plain_text", text: "Button label" },
        element: {
          type: "plain_text_input",
          action_id: "label_input",
          initial_value: reply?.label,
          placeholder: { type: "plain_text", text: "e.g. fraud" },
        },
      },
      {
        type: "input",
        block_id: "message_block",
        label: { type: "plain_text", text: "Message (posted as Hestia, never names who clicked it)" },
        element: {
          type: "plain_text_input",
          action_id: "message_input",
          multiline: true,
          initial_value: reply?.message,
        },
      },
    ],
  };
}

function programSettingsModal(program: Program): ModalView {
  return {
    type: "modal",
    callback_id: PROGRAM_SETTINGS_MODAL,
    private_metadata: JSON.stringify({ programId: program.id }),
    title: { type: "plain_text", text: "program settings" },
    submit: { type: "plain_text", text: "save" },
    close: { type: "plain_text", text: "cancel" },
    blocks: [
      {
        type: "input",
        block_id: "welcome_block",
        optional: true,
        label: { type: "plain_text", text: "Welcome message (use {name} for the opener's name)" },
        element: {
          type: "plain_text_input",
          action_id: "welcome_input",
          multiline: true,
          initial_value: program.welcome_message ?? "",
        },
      },
      {
        type: "input",
        block_id: "faq_block",
        optional: true,
        label: { type: "plain_text", text: "FAQ link" },
        element: {
          type: "plain_text_input",
          action_id: "faq_input",
          initial_value: program.faq_url ?? "",
        },
      },
      {
        type: "input",
        block_id: "admin_url_block",
        optional: true,
        label: { type: "plain_text", text: "Admin panel link (base URL, ?query=<user id> is appended)" },
        element: {
          type: "plain_text_input",
          action_id: "admin_url_input",
          initial_value: program.admin_url_template ?? "",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "manage quick replies" },
            action_id: `manage_quick_replies:${program.id}`,
            value: String(program.id),
          },
        ],
      },
    ],
  };
}

export function registerProgramAdminModals(): void {
  app.action("add_program", async ({ ack, body, client }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;
    if (!isSuperAdmin(body.user.id)) return;

    await client.views.open({
      trigger_id: body.trigger_id,
      view: await buildProgramModal(client),
    });
  });

  app.action(/^edit_program:/, async ({ ack, body, client, action }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;
    if (!isSuperAdmin(body.user.id)) return;
    if (action.type !== "button") return;

    const program = getProgramById(Number(action.value));
    if (!program) return;

    await client.views.open({
      trigger_id: body.trigger_id,
      view: await buildProgramModal(client, program),
    });
  });

  app.view(PROGRAM_MODAL, async ({ ack, view, body, client }) => {
    const values = view.state.values;
    const name = values.name_block.name_input.value ?? "";
    const helpChannelId = values.help_channel_block.help_channel_input.selected_conversation ?? "";
    const btsChannelId = values.bts_channel_block.bts_channel_input.selected_conversation ?? "";
    const usergroupId = values.usergroup_block.usergroup_input.selected_option?.value ?? "";
    const adminUserId = values.admin_block.admin_input.selected_user ?? "";

    if (!name || !helpChannelId || !btsChannelId || !usergroupId || !adminUserId) {
      await ack({
        response_action: "errors",
        errors: { name_block: "All fields are required." },
      });
      return;
    }

    const { programId } = JSON.parse(view.private_metadata || "{}") as { programId?: number };

    try {
      if (programId) {
        updateProgram(programId, {
          name,
          helpChannelId,
          btsChannelId,
          usergroupId,
          adminUserId,
        });
      } else {
        createProgram({
          name,
          helpChannelId,
          btsChannelId,
          usergroupId,
          adminUserId,
        });
      }
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        await ack({
          response_action: "errors",
          errors: { help_channel_block: "Another program already uses this help channel." },
        });
        return;
      }
      throw err;
    }

    await ack();
    await publishHomeView(body.user.id, "admin");
  });

  app.action(/^program_settings:/, async ({ ack, body, client, action }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;
    if (action.type !== "button") return;

    const program = getProgramById(Number(action.value));
    if (!program) return;
    if (program.admin_user_id !== body.user.id && !isSuperAdmin(body.user.id)) return;

    await client.views.open({
      trigger_id: body.trigger_id,
      view: programSettingsModal(program),
    });
  });

  app.view(PROGRAM_SETTINGS_MODAL, async ({ ack, view, body }) => {
    const { programId } = JSON.parse(view.private_metadata || "{}") as { programId: number };
    const program = getProgramById(programId);
    if (!program) {
      await ack();
      return;
    }
    if (program.admin_user_id !== body.user.id && !isSuperAdmin(body.user.id)) {
      await ack();
      return;
    }

    const values = view.state.values;
    const welcomeMessage = values.welcome_block.welcome_input.value || null;
    const faqUrl = values.faq_block.faq_input.value || null;
    const adminUrlTemplate = values.admin_url_block.admin_url_input.value || null;

    updateProgram(programId, { welcomeMessage, faqUrl, adminUrlTemplate });

    await ack();
    await publishHomeView(body.user.id, "overview");
  });

  app.action(/^manage_quick_replies:/, async ({ ack, body, client, action }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;
    if (action.type !== "button") return;

    const program = getProgramById(Number(action.value));
    if (!program) return;
    if (program.admin_user_id !== body.user.id && !isSuperAdmin(body.user.id)) return;

    await client.views.push({
      trigger_id: body.trigger_id,
      view: quickRepliesListView(program),
    });
  });

  app.action(/^add_quick_reply:/, async ({ ack, body, client, action }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;
    if (action.type !== "button") return;

    const programId = Number(action.value);
    const program = getProgramById(programId);
    if (!program) return;
    if (program.admin_user_id !== body.user.id && !isSuperAdmin(body.user.id)) return;

    await client.views.push({
      trigger_id: body.trigger_id,
      view: quickReplyFormModal(programId),
    });
  });

  app.action(/^quick_reply_row_actions:/, async ({ ack, body, client, action }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id || !body.view) return;
    if (action.type !== "overflow") return;

    const quickReplyId = Number(action.action_id.slice("quick_reply_row_actions:".length));
    const reply = getQuickReply(quickReplyId);
    if (!reply) return;
    const program = getProgramById(reply.program_id);
    if (!program) return;
    if (program.admin_user_id !== body.user.id && !isSuperAdmin(body.user.id)) return;

    if (action.selected_option.value === "edit") {
      await client.views.push({
        trigger_id: body.trigger_id,
        view: quickReplyFormModal(program.id, quickReplyId),
      });
      return;
    }

    // delete
    deleteQuickReply(quickReplyId);
    await client.views.update({
      view_id: body.view.id,
      view: quickRepliesListView(program),
    });
  });

  app.view(QUICK_REPLY_FORM_MODAL, async ({ ack, view }) => {
    const { programId, quickReplyId } = JSON.parse(view.private_metadata || "{}") as {
      programId: number;
      quickReplyId?: number;
    };
    const program = getProgramById(programId);
    if (!program) {
      await ack();
      return;
    }

    const values = view.state.values;
    const label = values.label_block.label_input.value ?? "";
    const message = values.message_block.message_input.value ?? "";

    if (!label || !message) {
      await ack({
        response_action: "errors",
        errors: { label_block: "Label and message are both required." },
      });
      return;
    }

    if (quickReplyId) {
      updateQuickReply(quickReplyId, { label, message });
    } else {
      addQuickReply(programId, label, message);
    }

    // Pop back to the quick replies list, refreshed, instead of just closing.
    await ack({
      response_action: "update",
      view: quickRepliesListView(program),
    });
  });
}
