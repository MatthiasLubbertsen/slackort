import { app } from "./slack/app";
import "./db";
import { registerCreateTicketFromMessage } from "./features/tickets/createTicketFromMessage";
import { registerResolveTicket } from "./features/tickets/resolveTicket";
import { registerUserInfoModal } from "./features/tickets/userInfoModal";
import { registerHome } from "./features/home/publishHome";
import { registerProgramAdminModals } from "./features/home/programAdminModals";
import { registerDailySummary } from "./features/summary/dailySummary";
import { registerApiServer } from "./api/server";
import { registerWebServer } from "./web/server";
import { migrateLegacyProgram } from "./db/legacyMigration";

migrateLegacyProgram();

registerCreateTicketFromMessage();
registerResolveTicket();
registerUserInfoModal();
registerHome();
registerProgramAdminModals();
registerDailySummary();
registerApiServer();
registerWebServer();

(async () => {
  await app.start();
  console.log("Hestia is running (Socket Mode)");
})();
