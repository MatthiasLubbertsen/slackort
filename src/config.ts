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

  dailySummaryCron: process.env.DAILY_SUMMARY_CRON || "0 9 * * *",
  timezone: process.env.TIMEZONE || "UTC",

  dbPath: process.env.DB_PATH || "./data/hestia.db",
};
