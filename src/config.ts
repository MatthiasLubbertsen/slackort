import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  slackBotToken: required("SLACK_BOT_TOKEN"),
  slackAppToken: required("SLACK_APP_TOKEN"),
  slackSigningSecret: required("SLACK_SIGNING_SECRET"),

  supportChannelId: required("SUPPORT_CHANNEL_ID"),
  summaryChannelId: process.env.SUMMARY_CHANNEL_ID || required("SUPPORT_CHANNEL_ID"),

  supportUsergroupId: required("SUPPORT_USERGROUP_ID"),
  faqCanvasUrl: required("FAQ_CANVAS_URL"),

  stardanceAdminUrl:
    process.env.STARDANCE_ADMIN_URL || "https://stardance.hackclub.com/admin/users",

  dailySummaryCron: process.env.DAILY_SUMMARY_CRON || "0 9 * * *",
  timezone: process.env.TIMEZONE || "UTC",

  dbPath: process.env.DB_PATH || "./data/hestia.db",

  // How soon after opening a ticket does a second top-level message from the
  // same person count as an accidental duplicate rather than a genuinely new
  // issue. Set API_PORT/WEB_PORT to 0 to disable either server.
  duplicateWindowMs:
    (process.env.DUPLICATE_WINDOW_MINUTES
      ? Number(process.env.DUPLICATE_WINDOW_MINUTES)
      : 5) *
    60 *
    1000,

  // Placeholder web page (hestia.matthiaz.dev), no auth, nothing sensitive on it.
  webPort: process.env.WEB_PORT ? Number(process.env.WEB_PORT) : 7777,

  // Read-only JSON stats API (api.hestia.matthiaz.dev), no auth on purpose.
  apiPort: process.env.API_PORT ? Number(process.env.API_PORT) : 7778,
};
