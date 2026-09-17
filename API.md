# Hestia stats API

A read-only JSON API, no authentication, no API key. That's deliberate: every endpoint here is a `GET`, nothing writes anything, and the numbers it exposes (ticket counts, hang time, helper leaderboards) are meant to be public info. If you'd rather it not be reachable at all, set `API_PORT=0` in `.env`.

Base URL is wherever `API_PORT` (default `7778`) is exposed, e.g. `https://api.hestia.matthiaz.dev`.

All responses are `application/json`. Errors are `{"error": "..."}` with a `4xx` status.

## `GET /health`

No params. For an uptime checker.

```json
{ "ok": true }
```

## `GET /api/programs`

Every configured Program. Use this to find a `programId` for the endpoints below.

```json
{
  "programs": [
    { "id": 1, "name": "Hackatime", "helpChannelId": "C0123", "btsChannelId": "C0456" },
    { "id": 2, "name": "Stardance", "helpChannelId": "C0789", "btsChannelId": "C0ABC" }
  ]
}
```

## `GET /api/overview?programId=<id>`

Category counts (all-time and past 24h) and hang time for one Program, plus its leaderboards at three ranges. `programId` is required, `400` if missing or unknown.

```json
{
  "allTime": {
    "total": 412,
    "open": 6,
    "inProgress": 3,
    "closed": 403,
    "hangTimeMinutes": 214
  },
  "past24h": {
    "total": 18,
    "open": 2,
    "inProgress": 1,
    "closed": 15,
    "closedToday": 20,
    "hangTimeMinutes": 41
  },
  "leaderboard": {
    "past24h": [{ "resolved_by": "U012ABC", "count": 4, "resolvedByName": "elliott" }],
    "weekly": [{ "resolved_by": "U012ABC", "count": 19, "resolvedByName": "elliott" }],
    "allTime": [{ "resolved_by": "U012ABC", "count": 201, "resolvedByName": "elliott" }]
  }
}
```

`closedToday` (in `past24h`) counts every ticket resolved in the last 24 hours regardless of when it was opened; `closed` counts tickets that were both opened and resolved within that window, so the two numbers usually differ.

## `GET /api/tickets`

Paginated ticket list.

| query param | required | notes |
| --- | --- | --- |
| `programId` | no | omit to list across every Program |
| `status` | no | `open` or `resolved` |
| `limit` | no | default 50, max 200 |
| `offset` | no | default 0 |
| `names` | no | `true` to also resolve Slack display names (one API call per unique user, cached 10 minutes) |

```json
{
  "tickets": [
    {
      "id": 88,
      "programId": 1,
      "channelId": "C0123",
      "messageTs": "1717000000.000100",
      "openerId": "U0OPENER",
      "subject": "my hackatime heartbeats aren't showing up",
      "status": "resolved",
      "category": "closed",
      "assignedTo": "U012ABC",
      "createdAt": 1717000000000,
      "resolvedAt": 1717000900000,
      "resolvedBy": "U012ABC",
      "resolutionNote": null
    }
  ],
  "total": 412,
  "limit": 50,
  "offset": 0
}
```

`category` is `open` (unclaimed), `in_progress` (claimed, not yet resolved), or `closed` (resolved) -- the same three-state view used everywhere else in Hestia, derived from `status` + `assignedTo`. `resolutionNote` is only set when the ticket was closed with one of a Program's canned quick replies instead of the plain "resolved by X" flow; it's the exact text posted, and it's `null` otherwise. Pass `names=true` to also get `openerName`, `resolvedByName`, `assignedToName`.

## `GET /api/tickets/:id`

One ticket by its numeric id. Always includes names and a live Slack permalink (equivalent to `?names=true` on the list endpoint, plus `permalink`).

```json
{
  "id": 88,
  "programId": 1,
  "channelId": "C0123",
  "messageTs": "1717000000.000100",
  "openerId": "U0OPENER",
  "subject": "my hackatime heartbeats aren't showing up",
  "status": "resolved",
  "category": "closed",
  "assignedTo": "U012ABC",
  "createdAt": 1717000000000,
  "resolvedAt": 1717000900000,
  "resolvedBy": "U012ABC",
  "resolutionNote": null,
  "openerName": "devansh",
  "resolvedByName": "elliott",
  "assignedToName": "elliott",
  "permalink": "https://hackclub.slack.com/archives/C0123/p1717000000000100"
}
```

`404` with `{"error": "not found"}` if the id doesn't exist.

## `GET /api/users/:userId/stats?programId=<id>`

One Slack user's ticket history as an *opener*, within one Program. `programId` is required.

```json
{ "total": 5, "open": 1, "resolved": 4 }
```

## `GET /api/leaderboard?programId=<id>&range=week|all`

Just the leaderboard rows for one Program. `programId` is required; `range` defaults to all-time.

```json
{ "leaderboard": [{ "resolved_by": "U012ABC", "count": 201, "resolvedByName": "elliott" }] }
```

## Nephthys-compatible proxy

Everything under `/nephthys/:program/` reshapes the same ticket data above into the response shapes documented for [Nephthys](https://github.com/hackclub/nephthys/blob/main/docs/api.md), so anything already built against a real Nephthys instance can point at Hestia instead by swapping its base URL. This is a translation layer, not a reimplementation -- there's no Nephthys storage or Slack app underneath it, just a reshaping of Hestia's own Program data.

`:program` is a slug: the Program's `name`, lowercased, with runs of non-alphanumeric characters collapsed to single hyphens (e.g. "Hackatime Squad" -> `hackatime-squad`). `404` with `{"error": "..."}` if nothing matches.

### `GET /nephthys/:program/api/stats_v2`

Same shape as Nephthys's own `stats_v2`: `all_time`, `past_24h`, `past_24h_previous`, `past_7d`, `past_7d_previous`, each with ticket counts, a helpers leaderboard, three mean-time-in-minutes fields, and (on `all_time` only) the oldest still-unclaimed ticket.

```json
{
  "all_time": {
    "tickets_total": 412,
    "tickets_open": 6,
    "tickets_closed": 403,
    "tickets_in_progress": 3,
    "helpers_leaderboard": [{ "id": 0, "slack_id": "U012ABC", "count": 201 }],
    "mean_hang_time_minutes_unresolved": 38.2,
    "mean_hang_time_minutes_all": 12.4,
    "mean_resolution_time_minutes": 47.9,
    "oldest_unanswered_ticket": {
      "id": 55,
      "created_at": "2026-06-01T12:00:00.000Z",
      "age_minutes": 130,
      "link": "https://hackclub.slack.com/archives/C0123/p1717000000000100"
    }
  },
  "past_24h": { "new_tickets_total": 18, "...": "see TimeBoundStats below" },
  "past_24h_previous": { "...": "..." },
  "past_7d": { "...": "..." },
  "past_7d_previous": { "...": "..." }
}
```

Each `TimeBoundStats` object (`past_24h` etc.) looks like:

```json
{
  "new_tickets_total": 18,
  "new_tickets_now_closed": 15,
  "new_tickets_still_open": 2,
  "new_tickets_in_progress": 1,
  "closed_today": 20,
  "closed_today_from_today": 15,
  "assigned_today_in_progress": 4,
  "helpers_leaderboard": [{ "id": 0, "slack_id": "U012ABC", "count": 4 }],
  "mean_hang_time_minutes_unresolved": 22.1,
  "mean_hang_time_minutes_all": 9.8,
  "mean_resolution_time_minutes": 33.5
}
```

### `GET /nephthys/:program/api/tickets`

Same query params as Nephthys documents (`status=open|closed|in_progress`, `since`/`after`, `until`/`before`, ISO 8601 dates), returning a bare array (not wrapped in an object, matching Nephthys):

```json
[
  {
    "id": 88,
    "title": "my hackatime heartbeats aren't showing up",
    "status": "CLOSED",
    "opened_by": { "id": 0, "slack_id": "U0OPENER", "username": null },
    "closed_by": { "id": 0, "slack_id": "U012ABC", "username": null },
    "assigned_to": { "id": 0, "slack_id": "U012ABC", "username": null },
    "reopened_by": null,
    "team_tags": [],
    "created_at": "2026-05-30T09:00:00.000Z",
    "closed_at": "2026-05-30T09:15:00.000Z",
    "message_ts": "1717000000.000100"
  }
]
```

### `GET /nephthys/:program/api/ticket?id=<id>`

One ticket in the same shape as above. `404` if it doesn't exist or belongs to a different Program.

### Fields Hestia can't fill in honestly

A few fields in Nephthys's shape have nothing in Hestia's data model to map from. Rather than drop them (and break the shape), they're filled with a documented placeholder:

- **`User.id`** is always `0`. Nephthys users have their own internal integer ID; Hestia only ever has a Slack user ID. `slack_id` is the field with real information in it.
- **`reopened_by`** is always `null`. Reopening a ticket in Hestia just clears its resolution fields, it never records who reopened it.
- **`team_tags`** is always `[]`. Hestia has no tagging concept for tickets.
- **`mean_hang_time_minutes_*`** use a ticket's first-claim time (`assigned_at`) as a stand-in for "time to first helper response," since Hestia has no separate first-reply timestamp. A ticket that was resolved without ever being explicitly claimed (someone just clicked "i get it now," or closed it with a quick reply) falls back to its resolution time for this one.

## Notes

- IDs throughout (`openerId`, `resolvedBy`, `assignedTo`, `resolved_by`) are raw Slack user IDs (`U...`). Pass `names=true` where offered, or hit `/api/tickets/:id`, to get a display name resolved alongside it.
- Timestamps (`createdAt`, `resolvedAt`) are Unix milliseconds. `messageTs` is Slack's own message timestamp format (seconds, with a decimal fraction), not milliseconds.
- The same overview data (pie chart, stat boxes, leaderboard), with a Program switcher, is also on the Slack Home tab, public to the whole workspace, not gated to helpers of that Program.
