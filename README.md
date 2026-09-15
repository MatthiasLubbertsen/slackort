# Hestia

A support ticket bot for Slack. Everything about running a ticket lives inside Slack, no web dashboard, no separate database UI. It also ships two tiny plain HTTP servers: a read-only JSON stats API and a placeholder page, both unauthenticated by design.

## Features

- **Just post in the support channel**, any top-level message there automatically opens a ticket, no slash command needed
- The message gets a :thinking_face: reaction while open, and Hestia replies **in a thread** with a friendly greeting (using the opener's display name, never a ping), a nudge to check the FAQ, and an **i get it now** button to resolve it
- Either the **ticket opener** or anyone in your **support user group** can resolve or reopen a ticket
- On resolve: the button disappears, :thinking_face: flips to :white_check_mark: on the original message, and a **new** thread message announces who resolved it, with a **reopen** button
- On reopen: a brand new "reopened by" message is posted (the old resolved announcement is left alone as history, just loses its button), and the resolve button comes back
- A tiny, staff-only overflow menu on the greeting ("🔎 Support Scouts only") opens a modal for helpers with the opener's ticket stats, a one-click link into the Stardance admin panel, a **claim ticket** button, canned quick-close replies, and a **wipe thread** button
- Non-Scouts (including the ticket opener) get bounced with an ephemeral message right in the thread if they try to click that menu
- Post again *shortly* after opening a ticket (an accidental double-post) and Hestia redirects you back to that thread with a ping, instead of opening a duplicate. Wait long enough and a second message is treated as a genuinely new ticket, you can have more than one open at a time
- **App Home** tab with two views (switch with the buttons up top): an overview (a ticket-status pie chart, total/24h stat boxes with hang time, and a two-column all-time/24h leaderboard) and "my tickets" (whatever's currently claimed and assigned to you)
- A **daily summary** is posted automatically (opened / resolved / still-open counts, average resolution time, oldest open tickets)
- A **read-only stats API** and a **placeholder web page**, both plain HTTP, no API keys
- Every button is lowercase with no emoji, on purpose

## Stack

- TypeScript
- [`@slack/bolt`](https://slack.dev/bolt-js/) running in **Socket Mode**, no public URL needed for the bot itself
- `better-sqlite3` for storage, a single local file, no separate database server
- `node-cron` for the daily summary schedule
- `express` for the stats API and the placeholder page

## Project layout

```
src/
  config.ts                 env var loading / validation
  index.ts                  entrypoint, wires everything up
  api/
    server.ts                read-only stats API (express, port 7778 by default)
  web/
    server.ts                placeholder page (express, port 7777 by default)
  db/
    index.ts                sqlite connection + schema + migrations
    tickets.ts               ticket queries (create, resolve, reopen, leaderboard, stats)
  slack/
    app.ts                   Bolt app instance (Socket Mode)
    helpers.ts               "is this user a helper?" (usergroup lookup + cache)
    userName.ts              friendly display name lookup, never a mention
  features/
    tickets/
      blocks.ts                    Block Kit builders (intro, resolved, reopened)
      cannedCloseReasons.ts        the quick-close reason list, add more here
      createTicketFromMessage.ts   message listener that opens a ticket
      resolveTicket.ts             resolve + reopen button handlers
      userInfoModal.ts             staff-only overflow menu, user info, claim, quick close, wipe thread
    home/
      publishHome.ts         App Home view, tab switching, stats boxes, leaderboards
      statusChart.ts         builds the quickchart.io pie chart URL
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

- **Opening a ticket:** any plain top-level message posted in `SUPPORT_CHANNEL_ID` (not a thread reply, not from a bot, not an edit/join/etc.) reacts with :thinking_face: and gets a ticket row keyed on its `channel_id` + `message_ts`. Hestia looks up the opener's display name (always that, falling back through real name and username, never an `@mention`) and replies in a thread with a greeting, the FAQ link inlined in a sentence so it unfurls, and an "I get it now" button. That reply's `ts` is stored as `reply_ts` so it can be rewritten later.
- **Resolving:** clicking the button checks that the clicker is either the opener or a member of `SUPPORT_USERGROUP_ID` (looked up live via `usergroups.users.list`, cached 5 minutes). If allowed, the ticket is marked resolved, the original threaded reply is rewritten with the button removed, a brand new message announces who resolved it with a Reopen button (`resolution_ts` tracks that message), and the reaction on the original message flips from :thinking_face: to :white_check_mark:.
- **Reopening:** clicking **Reopen** (opener or helper again) leaves the resolved announcement's text untouched and just strips its button, restores the resolve button on the original reply, posts a brand new "reopened by" message, and flips the reaction back to :thinking_face:.
- **Accidental double-posts:** if someone who already has an open ticket posts *another* top-level message within `DUPLICATE_WINDOW_MINUTES` (default 5) of opening it, Hestia doesn't create a second ticket, it posts an ephemeral reply (visible only to them, right in that new message's thread, and it does ping them since only they can see it) pointing back at the real thread, and marks the stray message :white_check_mark:. Past that window a new top-level message opens a genuinely separate ticket, people can have more than one open ticket at once.
- **Staff-only user info:** the small overflow menu (⋮, labeled "🔎 Support Scouts only") on the greeting message checks `isHelper` before doing anything; anyone else (opener included) gets an ephemeral "staff only" reply posted right in the ticket's thread. Helpers get a modal with the opener's ticket stats (opened / resolved / currently open) and a link into `STARDANCE_ADMIN_URL` pre-filled with their Slack user ID.
- **Claiming:** while a ticket is open, the same modal shows whether it's unclaimed or who it's assigned to, with a "claim ticket" button. Claiming doesn't touch the public thread, it just sets `assigned_to`, which is what makes a ticket count as "in progress" instead of plain "open" everywhere else (stats, the pie chart, the API), and is what populates a helper's "my tickets" Home tab.
- **Quick close:** the same modal lists buttons from `cannedCloseReasons.ts`, each one resolves the ticket (no reopen button this time) and posts its exact message as the resolution announcement instead of the usual "resolved by X" line, so it never names which Scout clicked it (they're still credited internally for the leaderboard) and there's no celebratory wording either. The `fraud` reason pings a fixed Slack user ID (a bot) on purpose. Add a new `{ key, label, message }` entry to that file to add another reason, nothing else needs touching.
- **Wipe thread:** also in that modal, a "wipe thread" button deletes Hestia's own messages (the greeting reply and, if it exists, the resolution announcement) and reactions from the thread, then deletes the ticket row entirely, no confirmation dialog, no extra message anywhere. It never touches the opener's original message.
- **Ticket categories:** under the hood there's still just `open`/`resolved` in the database, but everywhere stats are shown a ticket is categorized as `closed` (resolved), `in_progress` (open + claimed), or `open` (open + unclaimed) -- matching how Stardance already thinks about tickets.
- **Daily summary:** a `node-cron` job (default `0 9 * * *`, timezone from `TIMEZONE`) posts opened/resolved/still-open counts, average resolution time, and the oldest still-open tickets to `SUMMARY_CHANNEL_ID`.

## App Home

Two views, switched with the buttons at the top (`home_tab_overview` / `home_tab_mine`), both re-publish the same Home tab for just that user:

- **Overview:** the FAQ link, a pie chart of Open/In Progress/Closed (rendered by quickchart.io from a URL built in `statusChart.ts`, no image processing happens on our end, it's a hosted chart-image service given a chart.js config, only aggregate counts ever go into that URL), two stat boxes (Total Tickets and Past 24 Hours, each with Total/Open/In Progress/Closed and average "hang time" in minutes, the 24h box also gets a Closed Today count), then a two-column, medal-free, numbered all-time vs. past-24-hours leaderboard.
- **My tickets:** a helper's currently claimed, still-open tickets. Not a helper, or nothing claimed yet? Just a friendly "nothing to worry about" message.

## Stats API and placeholder page

Two small express servers start automatically, no auth on either, on purpose (the API is GET-only, there's nothing to protect):

- **Stats API**, `API_PORT` (default `7778`):
  - `GET /health`, no auth, for an uptime check
  - `GET /api/overview`, category counts + hang time for all-time and the past 24h, plus leaderboards (24h/weekly/all-time)
  - `GET /api/tickets?status=open|resolved&limit=&offset=&names=true`, paginated ticket list; add `names=true` to also resolve Slack display names (costs an API call per name, cached 10 minutes)
  - `GET /api/tickets/:id`, one ticket with names and a live Slack permalink always included
  - `GET /api/users/:userId/stats`, opened/resolved/open counts for one Slack user ID
  - `GET /api/leaderboard?range=week|all`, just the leaderboard rows

  Every ticket object includes `category` (`open`/`in_progress`/`closed`) and `assignedTo` alongside the raw `status`.
- **Placeholder page**, `WEB_PORT` (default `7777`): just returns `hi`, swap in something real later.

Set either port to `0` in `.env` to turn that server off.

### Pointing a domain at it

This repo only exposes the ports, container to host, DNS and a reverse proxy are a server-level setup step outside this repo. Roughly, for `hestia.matthiaz.dev` -> port 7777 and `api.hestia.matthiaz.dev` -> port 7778:

1. DNS: point both subdomains at your server's IP (an A/AAAA record, or a CNAME if you're using a tunnel).
2. Reverse proxy: whatever you're already running (nginx, Caddy, nginx proxy manager) needs a server block per subdomain forwarding to `localhost:7777` and `localhost:7778`. A bare nginx example:
   ```nginx
   server {
       server_name hestia.matthiaz.dev;
       location / { proxy_pass http://localhost:7777; }
   }
   server {
       server_name api.hestia.matthiaz.dev;
       location / { proxy_pass http://localhost:7778; }
   }
   ```
3. TLS: `certbot --nginx` (or however you're already issuing certs for your other subdomains) covers both once the server blocks exist.

## Notes

- All state lives in the sqlite file at `DB_PATH` (default `./data/hestia.db`). Back that file up if you care about ticket history.
- Socket Mode means the Slack side of the bot needs no inbound HTTP endpoint, only the stats API and placeholder page do.
