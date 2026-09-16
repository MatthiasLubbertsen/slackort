import { config } from "../config";
import { createProgram, listPrograms } from "./programs";
import { addQuickReply } from "./quickReplies";
import { seedDefaultQuickRepliesInto } from "./defaultQuickReplies";
import { backfillProgramId } from "./tickets";

/**
 * One-time bridge for the original single-tenant deployment: if no Program
 * exists yet but the old SUPPORT_CHANNEL_ID-style env vars are still set,
 * turn them into the first Program automatically so the live bot keeps
 * working without anyone re-entering everything by hand.
 */
function createLegacyProgramIfNeeded(): void {
  if (listPrograms().length > 0) return;

  const { supportChannelId, summaryChannelId, faqCanvasUrl, stardanceAdminUrl } = config.legacy;

  if (!supportChannelId || !summaryChannelId) {
    return;
  }

  const adminUserId = config.superAdminUserIds[0];
  if (!adminUserId) return;

  const program = createProgram({
    name: "Legacy program",
    helpChannelId: supportChannelId,
    btsChannelId: summaryChannelId,
    adminUserId,
    faqUrl: faqCanvasUrl ?? null,
    adminUrlTemplate: stardanceAdminUrl ?? null,
  });

  addQuickReply(
    program.id,
    "fraud",
    "Hi, please keep your fraud related questions with <@U091HC53CE8>. It's better for us all!"
  );
  addQuickReply(
    program.id,
    "hackatime",
    "Hi, would you mind redirecting your Hackatime questions to letterbird.co/hackatime?"
  );
  seedDefaultQuickRepliesInto(program.id);

  console.log(
    `Migrated legacy .env config into Program #${program.id} ("Legacy program"). Rename/edit it from the admin tab whenever you like.`
  );
}

/**
 * Runs on every boot, safe and idempotent: creates the legacy Program the
 * first time (see above), then backfills `program_id` on any tickets that
 * predate that column existing at all -- without this, every ticket opened
 * before this upgrade would be invisible to resolve/reopen/claim, since
 * they'd have no Program to resolve permissions against.
 */
export function migrateLegacyProgram(): void {
  createLegacyProgramIfNeeded();

  for (const program of listPrograms()) {
    const changed = backfillProgramId(program.id, program.help_channel_id);
    if (changed > 0) {
      console.log(`Backfilled program_id on ${changed} pre-existing ticket(s) for "${program.name}"`);
    }
  }
}
