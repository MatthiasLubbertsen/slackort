# Hestia

A support ticket bot for Slack. Everything lives inside Slack: no web dashboard, no separate database UI, nothing to host beyond the bot process itself.

## Features

- **Just post in the support channel**, any top-level message there automatically opens a ticket, no slash command needed
- The message gets a :thinking_face: reaction while open, and Hestia replies **in a thread** with a friendly greeting (using the opener's display name, never a ping), a nudge to check the FAQ, and a **Resolve** button
- Either the **ticket opener** or anyone in your **support user group** can resolve or reopen a ticket
- On resolve: the Resolve button disappears, :thinking_face: flips to :white_check_mark: on the original message, and a **new** thread message announces who resolved it, with a **Reopen** button
- On reopen: a brand new "reopened by" message is posted (the old resolved announcement is left alone as history, just loses its button), and the Resolve button comes back
- A tiny, staff-only overflow menu on the greeting opens a modal with the opener's ticket stats and a one-click link into the Stardance admin panel
- Post again outside your ticket's thread while it's still open (like a second "hi" as its own message) and Hestia points you back to the thread instead of opening a duplicate
- **App Home** tab shows the current open-ticket count, a link to the FAQ canvas, and a helper leaderboard (this week + all time)
- A **daily summary** is posted automatically (opened / resolved / still-open counts, average resolution time, oldest open tickets)

## Stack

- TypeScript
- [`@slack/bolt`](https://slack.dev/bolt-js/) running in **Socket Mode**, no public URL or web server needed
- `better-sqlite3` for storage, a single local file, no separate database server
- `node-cron` for the daily summary schedule

## Project layout

```
src/
  config.ts                 env var loading / validation
  index.ts                  entrypoint, wires everything up
  db/
    index.ts                sqlite connection + schema + migrations
    tickets.ts               ticket queries (create, resolve, reopen, leaderboard, stats)
  slack/
    app.ts                   Bolt app instance (Socket Mode)
    helpers.ts               "is this user a helper?" (usergroup lookup + cache)
    userName.ts              friendly display name lookup, never a mention
  features/
    tickets/
      blocks.ts                    Block Kit builders (intro, resolved, reopened, stray nudge)
      createTicketFromMessage.ts   message listener that opens a ticket
      resolveTicket.ts             resolve + reopen button handlers
      userInfoModal.ts             staff-only overflow menu + user info modal
    home/
      publishHome.ts         App Home view + leaderboard rendering
    summary/
      dailySummary.ts        cron job + summary message
```

## Setup

1. **Create the Slack app** from the included manifest: go to [api.slack.com/apps](https://api.slack.com/apps), *Create New App*, *From an app manifest*, paste in `slack-app-manifest.yml`.
2. Under **Basic Information**, generate an **app-level token** with the `connections:write` scope. This is your `SLACK_APP_TOKEN` (starts `xapp-`).
3. Under **OAuth & Permissions**, install the app to your workspace and grab the **Bot User OAuth Token**. This is your `SLACK_BOT_TOKEN` (starts `xoxb-`).
4. Grab the **Signing Secret** from Basic Information. This is `SLACK_SIGNING_SECRET`.
5. Invite the bot to your support channel (`/invite @hestia`) and copy that channel's ID for `SUPPORT_CHANNEL_ID`. **Private channel?** The manifest already includes the `groups:read`/`groups:history` scopes and `message.groups` event needed for that, just make sure the invite happens (the bot can't see or post in a private channel it isn't a member of).
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

### Running with Docker

```bash
cp .env.example .env   # fill it in first
docker compose up -d --build
docker compose logs -f
```

The sqlite file lives at `./data/hestia.db` on the host (bind-mounted into the container), so ticket history survives rebuilds and restarts. To stop it: `docker compose down`.

## How it works

- **Opening a ticket:** any plain top-level message posted in `SUPPORT_CHANNEL_ID` (not a thread reply, not from a bot, not an edit/join/etc.) reacts with :thinking_face: and gets a ticket row keyed on its `channel_id` + `message_ts`. Hestia looks up the opener's display name (always that, falling back through real name and username, never an `@mention`) and replies in a thread with a greeting, the FAQ link inlined in a sentence so it unfurls, and a Resolve button. That reply's `ts` is stored as `reply_ts` so it can be rewritten later.
- **Resolving:** clicking **Resolve** checks that the clicker is either the opener or a member of `SUPPORT_USERGROUP_ID` (looked up live via `usergroups.users.list`, cached 5 minutes). If allowed, the ticket is marked resolved, the original threaded reply is rewritten with the Resolve button removed, a brand new message announces who resolved it with a Reopen button (`resolution_ts` tracks that message), and the reaction on the original message flips from :thinking_face: to :white_check_mark:.
- **Reopening:** clicking **Reopen** (opener or helper again) leaves the resolved announcement's text untouched and just strips its button, restores the Resolve button on the original reply, posts a brand new "reopened by" message, and flips the reaction back to :thinking_face:.
- **Staying threaded:** if someone who already has an open ticket posts *another* top-level message instead of replying in their ticket's thread, Hestia skips creating a second ticket, replies pointing them at the existing thread (with a permalink when it can get one), and marks that stray message :white_check_mark: so it doesn't sit there looking unhandled.
- **Staff-only user info:** the small overflow menu (⋮) on the greeting message opens a modal for helpers only, showing the opener's ticket stats (opened / resolved / currently open) and a link into `STARDANCE_ADMIN_URL` pre-filled with their Slack user ID.
- **Leaderboard / App Home:** on `app_home_opened`, queries `tickets` grouped by `resolved_by` for this week and all time.
- **Daily summary:** a `node-cron` job (default `0 9 * * *`, timezone from `TIMEZONE`) posts opened/resolved/still-open counts, average resolution time, and the oldest still-open tickets to `SUMMARY_CHANNEL_ID`.

## Notes

- All state lives in the sqlite file at `DB_PATH` (default `./data/hestia.db`). Back that file up if you care about ticket history.
- Socket Mode means there's no inbound HTTP endpoint to expose, just run the process anywhere with outbound internet access.
