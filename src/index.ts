import { app } from "./slack/app";
import "./db";
import { registerOpenTicket } from "./features/tickets/openTicket";
import { registerResolveTicket } from "./features/tickets/resolveTicket";
import { registerHome } from "./features/home/publishHome";
import { registerDailySummary } from "./features/summary/dailySummary";

registerOpenTicket();
registerResolveTicket();
registerHome();
registerDailySummary();

(async () => {
  await app.start();
  console.log("⚡️ Slackort is running (Socket Mode)");
})();
