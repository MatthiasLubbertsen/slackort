# slackort

A support ticket bot for Slack — **Slack** + **support**. Everything lives inside Slack: no web dashboard, no separate database UI, nothing to host beyond the bot process itself.

## Features

- **`/ticket`** slash command opens a modal, then posts the ticket as a message in your support channel
- The ticket message reacts with :thinking_face: while open, and gets a **Resolve** button plus a **View FAQ** button (links straight to a Slack canvas)
- Either the **ticket opener** or anyone in your **support user group** can resolve a ticket
- On resolve: :thinking_face: is swapped for :white_check_mark:, and the message updates to show who closed it
- **App Home** tab shows the current open-ticket count, a link to the FAQ canvas, and a helper leaderboard (this week + all time)
- A **daily summary** is posted automatically (opened / resolved / still-open counts, average resolution time, oldest open tickets)

## Stack

- TypeScript
- [`@slack/bolt`](https://slack.dev/bolt-js/) running in **Socket Mode** — no public URL or web server needed
- `better-sqlite3` for storage — a single local file, no separate database server
- `node-cron` for the daily summary schedule

## Project layout

```
src/
  config.ts                 env var loading / validation
  index.ts                  entrypoint, wires everything up
  db/
    index.ts                sqlite connection + schema
    tickets.ts               ticket queries (create, resolve, leaderboard, stats)
  slack/
    app.ts                   Bolt app instance (Socket Mode)
    helpers.ts               "is this user a helper?" (usergroup lookup + cache)
  features/
    tickets/
      blocks.ts              Block Kit builder for a ticket message
      openTicket.ts          /ticket command + modal submission
      resolveTicket.ts        resolve button handler
    home/
      publishHome.ts         App Home view + leaderboard rendering
    summary/
      dailySummary.ts        cron job + summary message
```

## Setup

1. **Create the Slack app** from the included manifest: go to [api.slack.com/apps](https://api.slack.com/apps) → *Create New App* → *From an app manifest* → paste in `slack-app-manifest.yml`.
2. Under **Basic Information**, generate an **app-level token** with the `connections:write` scope — this is your `SLACK_APP_TOKEN` (starts `xapp-`).
3. Under **OAuth & Permissions**, install the app to your workspace and grab the **Bot User OAuth Token** — this is your `SLACK_BOT_TOKEN` (starts `xoxb-`).
4. Grab the **Signing Secret** from Basic Information — this is `SLACK_SIGNING_SECRET`.
5. Invite the bot to your support channel (`/invite @slackort`) and copy that channel's ID for `SUPPORT_CHANNEL_ID`.
6. Create (or reuse) a Slack **user group** for your helpers/support team, and copy its ID for `SUPPORT_USERGROUP_ID`.
7. Create your FAQ **canvas**, copy its link, and set `FAQ_CANVAS_URL`.
8. Copy `.env.example` to `.env` and fill in the values above.

```bash
cp .env.example .env
npm install
npm run dev     # runs with tsx + auto-reload
# or
npm run build && npm start
```

## How it works

- **Opening a ticket:** `/ticket` → modal (subject + optional details) → on submit, a message is posted to `SUPPORT_CHANNEL_ID` and reacted with :thinking_face:. A row is written to the `tickets` table keyed on the message's `channel_id` + `message_ts`.
- **Resolving:** clicking **Resolve** checks that the clicker is either the opener or a member of `SUPPORT_USERGROUP_ID` (looked up live via `usergroups.users.list`, cached 5 minutes). If allowed, the ticket row is marked resolved, the message is rewritten to show who closed it, and the reaction flips from :thinking_face: to :white_check_mark:.
- **Leaderboard / App Home:** on `app_home_opened`, queries `tickets` grouped by `resolved_by` for this week and all time.
- **Daily summary:** a `node-cron` job (default `0 9 * * *`, timezone from `TIMEZONE`) posts opened/resolved/still-open counts, average resolution time, and the oldest still-open tickets to `SUMMARY_CHANNEL_ID`.

## Notes

- All state lives in the sqlite file at `DB_PATH` (default `./data/slackort.db`). Back that file up if you care about ticket history.
- Socket Mode means there's no inbound HTTP endpoint to expose — just run the process anywhere with outbound internet access.
