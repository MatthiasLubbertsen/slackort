# Hestia

A support ticket bot for Slack, one instance serving many `#...-help` channels ("Programs") at once. Everything about running a ticket, and everything about configuring a Program, lives inside Slack, no web dashboard, no separate database UI. It also ships two tiny plain HTTP servers: a read-only JSON stats API (unauthenticated by design, since the stats are meant to be public info) and a placeholder web page.

## Programs, and who can do what

A **Program** is one help channel + one private "BTS" channel (daily summaries) + one helper user group + its own welcome message, FAQ link, admin-panel link, and quick-close **quick replies**. Everything below happens per-Program.

- **Super admin** (`SUPER_ADMIN_USER_ID` in `.env`, comma-separated, the one thing that still lives outside the database since nothing in an empty database can decide who's allowed to create the first row in it): adds/edits Programs from the Home tab's **admin** tab -- their two channels, usergroup, and who's the Program's own admin. Can see every Program.
- **Program admin** (one user, assigned by a super admin): edits everything end users see for their Program from a **program settings** button on the overview tab -- welcome message, FAQ link, admin-panel link, and the quick replies list (add/edit/delete, no code changes needed).
- **Helper** (member of a Program's usergroup): claims/resolves/reopens/wipes tickets in that Program same as always.
- **Everyone else**: posts in a help channel and gets the ticket flow, same as before. The Home tab's overview stats and Program dropdown are public to the whole workspace, not gated to helpers, everyone sees the same pie chart / stat boxes / leaderboard and can switch between Programs, remembered across sessions. "My tickets" naturally comes up empty unless you're actually assigned something.

## Features

- **Just post in a Program's help channel**, any top-level message there automatically opens a ticket, no slash command needed
- The message gets a :thinking_face: reaction while open, and Hestia replies **in a thread** with that Program's welcome message (`{name}` fills in the opener's display name, never a ping), an FAQ nudge if the Program has one set, and an **i get it now** button to resolve it
- Either the **ticket opener** or anyone in that Program's **helper user group** can resolve or reopen a ticket
- On resolve: the button disappears, :thinking_face: flips to :white_check_mark: on the original message, and a **new** thread message announces who resolved it, with a **reopen** button
- On reopen: a brand new "reopened by" message is posted (the old resolved announcement is left alone as history, just loses its button), and the resolve button comes back
- A tiny, staff-only overflow menu on the greeting ("Support Scouts only") opens a modal for that Program's helpers with the opener's ticket stats, a one-click link into the admin panel (if the Program has one set), canned quick-close replies, and a **wipe thread** button
- Non-Scouts (including the ticket opener) get bounced with an ephemeral message right in the thread if they try to click that menu
- No claim button on the ticket itself, a ticket gets assigned the moment a helper replies in its thread (first one in wins), or any helper can force-claim it with an **assign to me** button in the staff modal
- Post again *shortly* after opening a ticket (an accidental double-post) and Hestia redirects you back to that thread with a ping, instead of opening a duplicate. Wait long enough and a second message is treated as a genuinely new ticket, you can have more than one open at a time
- **App Home** tab with three views (switch with the buttons up top, and it remembers whichever one you were on last), public to the whole workspace: an overview (a ticket-status pie chart, total/24h stat boxes with hang time, and a two-column all-time/24h leaderboard, all scoped to whichever Program is selected via a dropdown anyone can use), "my tickets" (whatever's currently assigned to you in that Program), and, super admins only, **admin** (add/edit Programs)
- A **daily summary** is posted automatically per Program, to its own BTS channel
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
  config.ts                 env var loading / validation (credentials, ports, cron, super admins)
  index.ts                  entrypoint, wires everything up, runs the legacy migration once
  api/
    server.ts                read-only stats API (express, port 7778 by default)
  web/
    server.ts                placeholder page (express, port 7777 by default)
  db/
    index.ts                sqlite connection + schema + migrations
    tickets.ts               ticket queries (create, resolve, reopen, leaderboard, stats), all program-scoped
    programs.ts              Program CRUD, isSuperAdmin, isProgramHelper, programsVisibleTo
    quickReplies.ts          per-Program quick-close reasons (CRUD)
    homeTabPrefs.ts          remembers each user's last Home tab and selected Program
    legacyMigration.ts       turns old single-Program env vars into the first Program, once
  utils/
    relativeTime.ts          "3 hours ago" style formatting
  slack/
    app.ts                   Bolt app instance (Socket Mode)
    helpers.ts               usergroup membership lookup + cache, parameterized per Program
    userName.ts              friendly display name lookup, never a mention
  features/
    tickets/
      blocks.ts                    Block Kit builders (intro, resolved, reopened), take a Program
      createTicketFromMessage.ts   message listener, resolves the Program from the channel, opens tickets, auto-claims on thread replies
      resolveTicket.ts             resolve + reopen button handlers
      userInfoModal.ts             staff-only overflow menu, user info, assign to me, quick close, wipe thread
    home/
      publishHome.ts             App Home view: tab + Program switching, stats boxes, leaderboards
      programAdminModals.ts      add/edit Program, program settings, quick replies CRUD modals
      statusChart.ts              builds the quickchart.io pie chart URL
    summary/
      dailySummary.ts        cron job, loops every Program and posts to its own BTS channel
```

## Setup

1. **Create the Slack app** from the included manifest: go to [api.slack.com/apps](https://api.slack.com/apps), *Create New App*, *From an app manifest*, paste in `slack-app-manifest.yml`. **Already have the app?** When `slack-app-manifest.yml` changes (new scopes or events), go to your app's **App Manifest** page and paste the updated YAML in to sync it, code changes alone don't add those on Slack's side.
2. Under **Basic Information**, generate an **app-level token** with the `connections:write` scope. This is your `SLACK_APP_TOKEN` (starts `xapp-`).
3. Under **OAuth & Permissions**, install the app to your workspace and grab the **Bot User OAuth Token**. This is your `SLACK_BOT_TOKEN` (starts `xoxb-`).
4. Grab the **Signing Secret** from Basic Information. This is `SLACK_SIGNING_SECRET`.
5. Set `SUPER_ADMIN_USER_ID` to your own Slack user ID (comma-separate more than one if needed).
6. Copy `.env.example` to `.env` and fill in the values above, then start the bot (below).
7. In Slack, open Hestia's **Home tab** -> **admin** -> **add program**: pick the help channel, the BTS channel, a helper user group, and who the Program's admin should be. Invite the bot to both channels first (`/invite @hestia`), it can't see or post in a channel it isn't a member of, private channels included.
8. That Program's admin can now set its welcome message, FAQ link, admin-panel link, and quick replies from **program settings** on the overview tab, no redeploy needed.

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

The sqlite file lives at `./data/hestia.db` on the host (bind-mounted into the container), so ticket history and Program config survive rebuilds and restarts. To stop it: `docker compose down`.

### Migrating an existing single-channel deployment

If you were already running Hestia before Programs existed, keep your old `SUPPORT_CHANNEL_ID` / `SUMMARY_CHANNEL_ID` / `SUPPORT_USERGROUP_ID` / `FAQ_CANVAS_URL` / `STARDANCE_ADMIN_URL` values in `.env` (see the bottom of `.env.example`). On first boot, if no Program exists yet, `src/db/legacyMigration.ts` turns them into your first Program automatically (admin defaults to your first `SUPER_ADMIN_USER_ID`, and its two `fraud`/`hackatime` quick replies are seeded from what used to be hardcoded). It also backfills `program_id` on every ticket that predates that column, on every boot, matched by channel, so tickets you already had open keep working with resolve/reopen/claim instead of silently losing their Program. Once that Program exists, those env vars are dead weight, feel free to delete them, everything about it now lives in the database and the admin tab.

## How it works

- **Opening a ticket:** any plain top-level message posted in a Program's help channel (not a thread reply, not from a bot, not an edit/join/etc.) reacts with :thinking_face: and gets a ticket row keyed on its `channel_id` + `message_ts`, tagged with that Program's `program_id`. Hestia looks up the opener's display name (always that, falling back through real name and username, never an `@mention`) and replies in a thread with that Program's welcome message, an FAQ nudge if set, and an "i get it now" button. That reply's `ts` is stored as `reply_ts` so it can be rewritten later.
- **Resolving:** clicking the button checks that the clicker is either the opener or a member of that Program's usergroup (looked up live via `usergroups.users.list`, cached 5 minutes per usergroup). If allowed, the ticket is marked resolved, the original threaded reply is rewritten with the button removed, a brand new message announces who resolved it with a Reopen button (`resolution_ts` tracks that message), and the reaction on the original message flips from :thinking_face: to :white_check_mark:.
- **Reopening:** clicking **Reopen** (opener or helper again) leaves the resolved announcement's text untouched and just strips its button, restores the resolve button on the original reply, posts a brand new "reopened by" message, and flips the reaction back to :thinking_face:.
- **Accidental double-posts:** if someone who already has an open ticket posts *another* top-level message within `DUPLICATE_WINDOW_MINUTES` (default 5) of opening it, Hestia doesn't create a second ticket, it posts an ephemeral reply (visible only to them, right in that new message's thread, and it does ping them since only they can see it) pointing back at the real thread, and marks the stray message :white_check_mark:. Past that window a new top-level message opens a genuinely separate ticket, people can have more than one open ticket at once.
- **Staff-only user info:** the small overflow menu (⋮, labeled "Support Scouts only") on the greeting message checks usergroup membership before doing anything; anyone else (opener included) gets an ephemeral "staff only" reply posted right in the ticket's thread. Helpers get a modal with the opener's ticket stats within that Program and, if the Program has `admin_url_template` set, a link into it pre-filled with the opener's Slack user ID.
- **Claiming:** no button on the ticket itself. The first helper to reply inside a ticket's thread claims it automatically (only if nobody's claimed it yet), or any helper can hit **assign to me** in the staff modal to take it regardless of who currently has it (no native Slack shortcut involved, on purpose). Claiming never touches the public thread, it just sets `assigned_to`, which is what makes a ticket count as "in progress" instead of plain "open" everywhere else (stats, the pie chart, the API), and is what populates a helper's "my tickets" Home tab. The staff modal shows the current assignment as plain text next to that button.
- **Quick close:** the same modal lists buttons from that Program's `quick_replies` rows, each one resolves the ticket (no reopen button this time) and posts its exact message as the resolution announcement instead of the usual "resolved by X" line, so it never names which Scout clicked it (they're still credited internally for the leaderboard) and there's no celebratory wording either. A Program's admin manages this list (add/edit/delete) from **program settings** -> **manage quick replies**, no code changes needed.
- **Wipe thread:** also in that modal, a "wipe thread" button deletes Hestia's own messages (the greeting reply and, if it exists, the resolution announcement) and reactions from the thread, then deletes the ticket row entirely, no confirmation dialog, no extra message anywhere. It never touches the opener's original message.
- **Ticket categories:** under the hood there's still just `open`/`resolved` in the database, but everywhere stats are shown a ticket is categorized as `closed` (resolved), `in_progress` (open + claimed), or `open` (open + unclaimed) -- matching how Stardance already thinks about tickets.
- **Daily summary:** a `node-cron` job (default `0 9 * * *`, timezone from `TIMEZONE`) loops every Program and posts opened/resolved/still-open counts and the oldest still-open tickets to that Program's own BTS channel.

## App Home

Three views, switched with the buttons at the top, all re-publishing the same Home tab for just that user. Whichever tab (and, for overview/mine, whichever Program) you last had selected is remembered per-user (`home_tab_prefs`), and every visit or switch recomputes everything fresh from the database, nothing is cached.

- **Overview:** a pie chart of Open/In Progress/Closed for the selected Program (rendered by quickchart.io from a URL built in `statusChart.ts`, no image processing happens on our end, it's a hosted chart-image service given a chart.js config, only aggregate counts ever go into that URL), Total Tickets and Past 24 Hours as two side-by-side stat boxes (Total/Open/In Progress/Closed and average "hang time" in minutes, the 24h box also gets a Closed Today count), a two-column, medal-free, numbered all-time vs. past-24-hours leaderboard, and, if you're that Program's admin or a super admin, a **program settings** button.
- **My tickets:** your currently assigned, still-open tickets in the selected Program, each rendered as its own little card (subject, "from @opener, opened 3 hours ago", a "view ticket" link). Nothing assigned? A friendly "nothing to worry about" message.
- **Admin** (super admins only): every Program (name, channels, admin) with an "edit" button per row, and an "add program" button that opens the same modal empty (two channel pickers, a usergroup picker built from a live `usergroups.list` call since Block Kit has no native usergroup-select element, and a user picker for the Program's admin).

A Program picker (shown whenever more than one Program exists, for anyone, not just its helpers) sits above the overview/mine content, since the overview stats are public info.

The `Hestia` title uses Block Kit's `header` block, which is already the single largest text style Slack offers, there's no way to make it visually bigger than that from Block Kit alone.

## Stats API and placeholder page

Two small express servers start automatically, no auth on either, on purpose (the API is GET-only, there's nothing to protect, and the stats it exposes are meant to be public info same as the Home tab). Full endpoint docs with example responses live in [`API.md`](./API.md); the short version:

- **Stats API**, `API_PORT` (default `7778`): `/health`, `/api/programs`, `/api/overview`, `/api/tickets`, `/api/tickets/:id`, `/api/users/:userId/stats`, `/api/leaderboard`, all JSON, most take a `programId`.
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

- All state, tickets and Program config alike, lives in the sqlite file at `DB_PATH` (default `./data/hestia.db`). Back that file up if you care about any of it.
- Socket Mode means the Slack side of the bot needs no inbound HTTP endpoint, only the stats API and placeholder page do.

## Verifying a change

No web dashboard means there's nothing to click through outside Slack itself. After deploying: open the Home tab's admin tab and add (or confirm) a Program, post a message in its help channel and watch the greeting reply appear, claim/resolve/reopen it, switch the Program dropdown, edit that Program's quick replies from program settings, and confirm the next daily summary posts separately per Program to each one's BTS channel.
