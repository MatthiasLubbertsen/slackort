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
    "past24h": [{ "resolved_by": "U012ABC", "count": 4 }],
    "weekly": [{ "resolved_by": "U012ABC", "count": 19 }],
    "allTime": [{ "resolved_by": "U012ABC", "count": 201 }]
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
{ "leaderboard": [{ "resolved_by": "U012ABC", "count": 201 }] }
```

## Notes

- IDs throughout (`openerId`, `resolvedBy`, `assignedTo`, `resolved_by`) are raw Slack user IDs (`U...`). Pass `names=true` where offered, or hit `/api/tickets/:id`, to get a display name resolved alongside it.
- Timestamps (`createdAt`, `resolvedAt`) are Unix milliseconds. `messageTs` is Slack's own message timestamp format (seconds, with a decimal fraction), not milliseconds.
- The same overview data (pie chart, stat boxes, leaderboard), with a Program switcher, is also on the Slack Home tab, public to the whole workspace, not gated to helpers of that Program.
