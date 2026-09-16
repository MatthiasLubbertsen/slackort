import type { KnownBlock, ModalView } from "@slack/bolt";
import { app } from "../../slack/app";
import { createProgram, getProgramById, isSuperAdmin, updateProgram, type Program } from "../../db/programs";
import {
  addQuickReply,
  deleteQuickReply,
  getQuickReply,
  listQuickReplies,
  updateQuickReply,
} from "../../db/quickReplies";
import {
  addDefaultQuickReply,
  deleteDefaultQuickReply,
  getDefaultQuickReply,
  listDefaultQuickReplies,
  seedDefaultQuickRepliesInto,
  updateDefaultQuickReply,
} from "../../db/defaultQuickReplies";
import { publishHomeView } from "./publishHome";

const PROGRAM_MODAL = "program_modal";
const QUICK_REPLY_FORM_MODAL = "quick_reply_form_modal";

interface Reply {
  id: number;
  label: string;
  message: string;
}

interface QuickReplyFormContext {
  scope: "program" | "default";
  programId?: number;
  quickReplyId?: number;
  rootViewId: string;
  draft?: { label?: string; message?: string };
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("UNIQUE constraint failed");
}

function canEditProgram(userId: string, program: Program): boolean {
  return isSuperAdmin(userId) || program.admin_user_id === userId;
}

/** Rows for whichever quick-reply list (a Program's own, or the global defaults), plus an "add" button. */
function quickReplyRowsBlocks(
  replies: Reply[],
  rowActionId: (id: number) => string,
  addButton: { actionId: string; value?: string }
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: "*Quick replies*" } },
  ];

  if (replies.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "_none yet_" } });
  }

  for (const reply of replies) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${reply.label}*\n${reply.message}` },
      accessory: {
        type: "overflow",
        action_id: rowActionId(reply.id),
        options: [
          { text: { type: "plain_text", text: "edit" }, value: "edit" },
          { text: { type: "plain_text", text: "delete" }, value: "delete" },
        ],
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "add quick reply" },
        action_id: addButton.actionId,
        ...(addButton.value !== undefined && { value: addButton.value }),
      },
    ],
  });

  return blocks;
}

/**
 * One modal for everything about a Program: its channels, its admin, the
 * copy end users see, and (once it exists) its quick replies inline right
 * beneath -- no separate "settings" or "manage quick replies" modal to hop
 * through.
 */
function buildProgramModal(program?: Program): ModalView {
  const blocks: KnownBlock[] = [
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
      label: {
        type: "plain_text",
        text: "BTS / helper channel (daily summaries post here, and anyone in it can claim, resolve, and manage tickets)",
      },
      element: {
        type: "conversations_select",
        action_id: "bts_channel_input",
        initial_conversation: program?.bts_channel_id,
        filter: { include: ["public", "private"] },
      },
    },
    {
      type: "input",
      block_id: "admin_block",
      label: { type: "plain_text", text: "Program admin (can edit everything here)" },
      element: {
        type: "users_select",
        action_id: "admin_input",
        initial_user: program?.admin_user_id,
      },
    },
    {
      type: "input",
      block_id: "welcome_block",
      optional: true,
      label: { type: "plain_text", text: "Welcome message (use {name} for the opener's name)" },
      element: {
        type: "plain_text_input",
        action_id: "welcome_input",
        multiline: true,
        initial_value: program?.welcome_message ?? "",
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
        initial_value: program?.faq_url ?? "",
      },
    },
    {
      type: "input",
      block_id: "admin_url_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Admin panel link (use {userId} for their Slack ID, {email} for their email if you've granted users:read.email)",
      },
      element: {
        type: "plain_text_input",
        action_id: "admin_url_input",
        initial_value: program?.admin_url_template ?? "",
      },
    },
  ];

  if (program) {
    blocks.push(
      ...quickReplyRowsBlocks(
        listQuickReplies(program.id),
        (id) => `quick_reply_row_actions:${id}`,
        { actionId: `add_quick_reply:${program.id}`, value: String(program.id) }
      )
    );
  }

  return {
    type: "modal",
    callback_id: PROGRAM_MODAL,
    private_metadata: JSON.stringify({ programId: program?.id }),
    title: { type: "plain_text", text: program ? "edit program" : "add program" },
    submit: { type: "plain_text", text: "save" },
    close: { type: "plain_text", text: "cancel" },
    blocks,
  };
}

function defaultQuickRepliesModal(): ModalView {
  return {
    type: "modal",
    title: { type: "plain_text", text: "Default quick replies" },
    close: { type: "plain_text", text: "close" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Copied onto every new Program when it's created. Editing this list never touches Programs that already exist, and a Program can freely edit or remove its own copy afterward.",
        },
      },
      ...quickReplyRowsBlocks(
        listDefaultQuickReplies(),
        (id) => `default_quick_reply_row_actions:${id}`,
        { actionId: "add_default_quick_reply" }
      ),
    ],
  };
}

function quickReplyFormModal(ctx: QuickReplyFormContext): ModalView {
  const existing = ctx.quickReplyId
    ? ctx.scope === "program"
      ? getQuickReply(ctx.quickReplyId)
      : getDefaultQuickReply(ctx.quickReplyId)
    : undefined;

  const label = ctx.draft?.label ?? existing?.label ?? "";
  const message = ctx.draft?.message ?? existing?.message ?? "";

  return {
    type: "modal",
    callback_id: QUICK_REPLY_FORM_MODAL,
    private_metadata: JSON.stringify({
      scope: ctx.scope,
      programId: ctx.programId,
      quickReplyId: ctx.quickReplyId,
      rootViewId: ctx.rootViewId,
    }),
    title: { type: "plain_text", text: existing ? "edit quick reply" : "add quick reply" },
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
          initial_value: label,
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
          initial_value: message,
        },
      },
      {
        type: "actions",
        block_id: "mention_block",
        elements: [
          {
            type: "users_select",
            action_id: "quick_reply_mention_picker",
            placeholder: { type: "plain_text", text: "ping a user or bot (optional)" },
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

    await client.views.open({ trigger_id: body.trigger_id, view: buildProgramModal() });
  });

  app.action(/^edit_program:/, async ({ ack, body, client, action }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;
    if (action.type !== "button") return;

    const program = getProgramById(Number(action.value));
    if (!program) return;
    if (!canEditProgram(body.user.id, program)) return;

    await client.views.open({ trigger_id: body.trigger_id, view: buildProgramModal(program) });
  });

  app.view(PROGRAM_MODAL, async ({ ack, view, body }) => {
    const values = view.state.values;
    const name = values.name_block.name_input.value ?? "";
    const helpChannelId = values.help_channel_block.help_channel_input.selected_conversation ?? "";
    const btsChannelId = values.bts_channel_block.bts_channel_input.selected_conversation ?? "";
    const adminUserId = values.admin_block.admin_input.selected_user ?? "";
    const welcomeMessage = values.welcome_block.welcome_input.value || null;
    const faqUrl = values.faq_block.faq_input.value || null;
    const adminUrlTemplate = values.admin_url_block.admin_url_input.value || null;

    if (!name || !helpChannelId || !btsChannelId || !adminUserId) {
      await ack({
        response_action: "errors",
        errors: { name_block: "All fields are required." },
      });
      return;
    }

    const { programId } = JSON.parse(view.private_metadata || "{}") as { programId?: number };

    // A program admin editing their own Program only reaches this modal
    // already gated by canEditProgram at open-time -- re-check here too in
    // case something changed underneath them mid-edit.
    if (programId) {
      const existing = getProgramById(programId);
      if (!existing || !canEditProgram(body.user.id, existing)) {
        await ack();
        return;
      }
    } else if (!isSuperAdmin(body.user.id)) {
      await ack();
      return;
    }

    try {
      if (programId) {
        updateProgram(programId, {
          name,
          helpChannelId,
          btsChannelId,
          adminUserId,
          welcomeMessage,
          faqUrl,
          adminUrlTemplate,
        });
      } else {
        const created = createProgram({
          name,
          helpChannelId,
          btsChannelId,
          adminUserId,
          welcomeMessage,
          faqUrl,
          adminUrlTemplate,
        });
        seedDefaultQuickRepliesInto(created.id);
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
    if (programId) {
      await publishHomeView(body.user.id, "overview", programId);
    } else {
      await publishHomeView(body.user.id, "admin");
    }
  });

  app.action("open_default_quick_replies", async ({ ack, body, client }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;
    if (!isSuperAdmin(body.user.id)) return;

    await client.views.open({ trigger_id: body.trigger_id, view: defaultQuickRepliesModal() });
  });

  app.action("add_default_quick_reply", async ({ ack, body, client }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id || !body.view) return;
    if (!isSuperAdmin(body.user.id)) return;

    await client.views.push({
      trigger_id: body.trigger_id,
      view: quickReplyFormModal({ scope: "default", rootViewId: body.view.id }),
    });
  });

  app.action(/^default_quick_reply_row_actions:/, async ({ ack, body, client, action }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id || !body.view) return;
    if (action.type !== "overflow") return;
    if (!isSuperAdmin(body.user.id)) return;

    const id = Number(action.action_id.slice("default_quick_reply_row_actions:".length));

    if (action.selected_option.value === "edit") {
      await client.views.push({
        trigger_id: body.trigger_id,
        view: quickReplyFormModal({ scope: "default", quickReplyId: id, rootViewId: body.view.id }),
      });
      return;
    }

    deleteDefaultQuickReply(id);
    await client.views.update({ view_id: body.view.id, view: defaultQuickRepliesModal() });
  });

  app.action(/^add_quick_reply:/, async ({ ack, body, client, action }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id || !body.view) return;
    if (action.type !== "button") return;

    const programId = Number(action.value);
    const program = getProgramById(programId);
    if (!program) return;
    if (!canEditProgram(body.user.id, program)) return;

    await client.views.push({
      trigger_id: body.trigger_id,
      view: quickReplyFormModal({ scope: "program", programId, rootViewId: body.view.id }),
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
    if (!canEditProgram(body.user.id, program)) return;

    if (action.selected_option.value === "edit") {
      await client.views.push({
        trigger_id: body.trigger_id,
        view: quickReplyFormModal({ scope: "program", programId: program.id, quickReplyId, rootViewId: body.view.id }),
      });
      return;
    }

    // delete
    deleteQuickReply(quickReplyId);
    await client.views.update({ view_id: body.view.id, view: buildProgramModal(program) });
  });

  // Appends a mention to the message field without saving anything -- lets
  // an admin ping a bot (or a person) without having to know its raw Slack
  // ID, since plain_text_input has no @-mention autocomplete of its own.
  app.action("quick_reply_mention_picker", async ({ ack, body, client, action }) => {
    await ack();
    if (action.type !== "users_select" || body.type !== "block_actions" || !body.view) return;

    const ctx = JSON.parse(body.view.private_metadata || "{}") as QuickReplyFormContext;
    const values = body.view.state.values;
    const label = values.label_block?.label_input?.value ?? "";
    const currentMessage = values.message_block?.message_input?.value ?? "";
    const mention = `<@${action.selected_user}>`;
    const message = currentMessage ? `${currentMessage} ${mention}` : mention;

    await client.views.update({
      view_id: body.view.id,
      view: quickReplyFormModal({ ...ctx, draft: { label, message } }),
    });
  });

  app.view(QUICK_REPLY_FORM_MODAL, async ({ ack, view, client }) => {
    const { scope, programId, quickReplyId, rootViewId } = JSON.parse(
      view.private_metadata || "{}"
    ) as QuickReplyFormContext;

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

    if (scope === "program") {
      if (!programId) {
        await ack();
        return;
      }
      if (quickReplyId) {
        updateQuickReply(quickReplyId, { label, message });
      } else {
        addQuickReply(programId, label, message);
      }
    } else if (quickReplyId) {
      updateDefaultQuickReply(quickReplyId, { label, message });
    } else {
      addDefaultQuickReply(label, message);
    }

    // Pop the form and refresh the real parent view directly, instead of
    // response_action:"update" -- that only replaces whatever's currently on
    // top of the stack, leaving the actual parent underneath stale (visible
    // again, out of date, if anyone ever hits the modal's back arrow).
    await ack();

    if (scope === "program" && programId) {
      const program = getProgramById(programId);
      if (program) {
        await client.views.update({ view_id: rootViewId, view: buildProgramModal(program) });
      }
    } else {
      await client.views.update({ view_id: rootViewId, view: defaultQuickRepliesModal() });
    }
  });
}
