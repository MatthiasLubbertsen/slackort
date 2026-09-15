import { app } from "./slack/app";
import "./db";
import { registerCreateTicketFromMessage } from "./features/tickets/createTicketFromMessage";
import { registerResolveTicket } from "./features/tickets/resolveTicket";
import { registerHome } from "./features/home/publishHome";
import { registerDailySummary } from "./features/summary/dailySummary";

registerCreateTicketFromMessage();
registerResolveTicket();
registerHome();
registerDailySummary();

(async () => {
  await app.start();
  console.log("🔥 Hestia is running (Socket Mode)");
})();
