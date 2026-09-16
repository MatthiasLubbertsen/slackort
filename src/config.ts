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

  // The only trust anchor that has to live outside the database: nothing in
  // the database can decide who's allowed to create the first row in it.
  // Comma-separated Slack user IDs, everything else is managed from Slack.
  superAdminUserIds: required("SUPER_ADMIN_USER_ID")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),

  dailySummaryCron: process.env.DAILY_SUMMARY_CRON || "0 9 * * *",
  timezone: process.env.TIMEZONE || "UTC",

  dbPath: process.env.DB_PATH || "./data/hestia.db",

  // How soon after opening a ticket does a second top-level message from the
  // same person count as an accidental duplicate rather than a genuinely new
  // issue.
  duplicateWindowMs:
    (process.env.DUPLICATE_WINDOW_MINUTES ? Number(process.env.DUPLICATE_WINDOW_MINUTES) : 5) *
    60 *
    1000,

  // Placeholder web page (hestia.matthiaz.dev), no auth, nothing sensitive on it.
  // Read-only JSON stats API (api.hestia.matthiaz.dev), no auth on purpose.
  // Set either to 0 to disable it.
  webPort: process.env.WEB_PORT ? Number(process.env.WEB_PORT) : 7777,
  apiPort: process.env.API_PORT ? Number(process.env.API_PORT) : 7778,

  // Only used to auto-create the first Program on first boot from an
  // existing single-tenant deployment. Safe to remove once that Program
  // exists and is managed from the Home tab instead.
  legacy: {
    supportChannelId: process.env.SUPPORT_CHANNEL_ID,
    summaryChannelId: process.env.SUMMARY_CHANNEL_ID || process.env.SUPPORT_CHANNEL_ID,
    faqCanvasUrl: process.env.FAQ_CANVAS_URL,
    stardanceAdminUrl: process.env.STARDANCE_ADMIN_URL,
  },
};
