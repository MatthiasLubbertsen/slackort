import { app } from "./slack/app";
import "./db";
import { registerCreateTicketFromMessage } from "./features/tickets/createTicketFromMessage";
import { registerResolveTicket } from "./features/tickets/resolveTicket";
import { registerUserInfoModal } from "./features/tickets/userInfoModal";
import { registerHome } from "./features/home/publishHome";
import { registerDailySummary } from "./features/summary/dailySummary";
import { registerApiServer } from "./api/server";

registerCreateTicketFromMessage();
registerResolveTicket();
registerUserInfoModal();
registerHome();
registerDailySummary();
registerApiServer();

(async () => {
  await app.start();
  console.log("🔥 Hestia is running (Socket Mode)");
})();
