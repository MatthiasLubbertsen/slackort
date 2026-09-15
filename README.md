# slackort

A support ticket bot for Slack — **Slack** + **support**. Everything lives inside Slack: no web dashboard, no separate database UI, nothing to host beyond the bot process itself.

## Features

- **Just post in the support channel** — any top-level message there automatically opens a ticket, no slash command needed
- The message gets a :thinking_face: reaction while open, and the bot replies **in a thread** with a **Resolve** button plus a **View FAQ** button (links straight to a Slack canvas)
- Either the **ticket opener** or anyone in your **support user group** can resolve a ticket
- On resolve: :thinking_face: is swapped for :white_check_mark: on the original message, and the threaded reply updates to show who closed it
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
      blocks.ts                    Block Kit builder for the threaded reply
      createTicketFromMessage.ts   message listener that opens a ticket
      resolveTicket.ts             resolve button handler
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
5. Invite the bot to your support channel (`/invite @slackort`) and copy that channel's ID for `SUPPORT_CHANNEL_ID`. **Private channel?** The manifest already includes the `groups:read`/`groups:history` scopes and `message.groups` event needed for that — just make sure the invite happens (the bot can't see or post in a private channel it isn't a member of).
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

- **Opening a ticket:** any plain top-level message posted in `SUPPORT_CHANNEL_ID` (not a thread reply, not from a bot, not an edit/join/etc.) reacts with :thinking_face: and gets a ticket row keyed on its `channel_id` + `message_ts`. The bot then replies in a thread on that message with the Resolve/FAQ controls -- that reply's `ts` is stored as `reply_ts` so it can be updated later. Keep discussing the issue right there in the thread.
- **Resolving:** clicking **Resolve** (in the thread) checks that the clicker is either the opener or a member of `SUPPORT_USERGROUP_ID` (looked up live via `usergroups.users.list`, cached 5 minutes). If allowed, the ticket row is marked resolved, the threaded reply is rewritten to show who closed it, and the reaction on the original message flips from :thinking_face: to :white_check_mark:.
- **Leaderboard / App Home:** on `app_home_opened`, queries `tickets` grouped by `resolved_by` for this week and all time.
- **Daily summary:** a `node-cron` job (default `0 9 * * *`, timezone from `TIMEZONE`) posts opened/resolved/still-open counts, average resolution time, and the oldest still-open tickets to `SUMMARY_CHANNEL_ID`.

## Notes

- All state lives in the sqlite file at `DB_PATH` (default `./data/slackort.db`). Back that file up if you care about ticket history.
- Socket Mode means there's no inbound HTTP endpoint to expose — just run the process anywhere with outbound internet access.
