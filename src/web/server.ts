import express from "express";
import { config } from "../config";
import { app as slackApp } from "../slack/app";
import { getFriendlyName } from "../slack/userName";
import { getProgramById, listPrograms, type Program } from "../db/programs";
import {
  averageHangTimeMinutes,
  closedCountSince,
  leaderboard,
  ticketCategoryCounts,
  type LeaderboardRow,
} from "../db/tickets";
import { buildStatusPieChartUrl } from "../features/home/statusChart";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderLeaderboardHtml(rows: LeaderboardRow[]): Promise<string> {
  if (rows.length === 0) {
    return `<p class="muted">nobody's resolved a ticket yet</p>`;
  }
  const items = await Promise.all(
    rows.map(async (row, i) => {
      const name = await getFriendlyName(slackApp.client, row.resolved_by);
      return `<li>${i + 1}. ${escapeHtml(name)}, ${row.count} resolved</li>`;
    })
  );
  return `<ol class="leaderboard">${items.join("")}</ol>`;
}

function statBoxHtml(
  title: string,
  counts: { total: number; open: number; inProgress: number; closed: number },
  hangTimeMinutes: number,
  extra?: string
): string {
  const closedLine = extra ? `Closed: ${counts.closed}, ${extra}` : `Closed: ${counts.closed}`;
  return `
    <div class="stat-box">
      <h3>${escapeHtml(title)}</h3>
      <p>Total: ${counts.total}, Open: ${counts.open}, In Progress: ${counts.inProgress}, ${closedLine}</p>
      <p>Hang time: ${Math.round(hangTimeMinutes)} minutes</p>
    </div>`;
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark light; }
  body {
    margin: 0;
    padding: 24px 16px 48px;
    background: #16181d;
    color: #e8e8ea;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin-bottom: 4px; }
  h2 { font-size: 1.1rem; margin-top: 32px; }
  h3 { margin: 0 0 6px; font-size: 0.95rem; color: #9aa; }
  p { margin: 4px 0; line-height: 1.5; }
  .muted { color: #888; }
  select {
    background: #24262c;
    color: #e8e8ea;
    border: 1px solid #3a3d45;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.95rem;
  }
  img { max-width: 100%; height: auto; margin: 16px 0; border-radius: 8px; background: #fff; }
  .stat-grid { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; }
  .stat-box, .board-box {
    background: #1e2026;
    border: 1px solid #2c2f37;
    border-radius: 8px;
    padding: 12px 16px;
    flex: 1 1 240px;
  }
  .board-grid { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; }
  ol.leaderboard { margin: 0; padding-left: 1.2em; }
  ol.leaderboard li { margin: 2px 0; }
</style>
</head>
<body>
  <div class="wrap">${body}</div>
</body>
</html>`;
}

async function renderProgramPage(program: Program, programs: Program[]): Promise<string> {
  const allTime = ticketCategoryCounts(program.id);
  const dayStart = Date.now() - ONE_DAY_MS;
  const last24h = ticketCategoryCounts(program.id, dayStart);
  const closedToday = closedCountSince(program.id, dayStart);
  const allTimeHangTime = averageHangTimeMinutes(program.id);
  const last24hHangTime = averageHangTimeMinutes(program.id, dayStart);

  const [allTimeBoardHtml, past24hBoardHtml] = await Promise.all([
    renderLeaderboardHtml(leaderboard(program.id)),
    renderLeaderboardHtml(leaderboard(program.id, dayStart)),
  ]);

  const options = programs
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === program.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    )
    .join("");

  const body = `
    <h1>Hestia</h1>
    <p class="muted">Support stats, public and read-only.</p>
    <form method="get">
      <select name="program" onchange="this.form.submit()">${options}</select>
      <noscript><button type="submit">switch</button></noscript>
    </form>
    <img src="${buildStatusPieChartUrl(allTime)}" alt="Ticket status breakdown for ${escapeHtml(program.name)}">
    <div class="stat-grid">
      ${statBoxHtml("Total Tickets", allTime, allTimeHangTime)}
      ${statBoxHtml("Past 24 Hours", last24h, last24hHangTime, `Closed Today: ${closedToday}`)}
    </div>
    <h2>Leaderboard</h2>
    <div class="board-grid">
      <div class="board-box"><h3>All-time</h3>${allTimeBoardHtml}</div>
      <div class="board-box"><h3>Past 24 hours</h3>${past24hBoardHtml}</div>
    </div>`;

  return pageShell(`Hestia -- ${program.name}`, body);
}

/**
 * A public, read-only stats page for hestia.matthiaz.dev, no auth, same
 * spirit as the JSON API: it's all aggregate counts and helper leaderboards,
 * nothing about individual tickets or their contents. Set WEB_PORT to 0 to
 * turn it off entirely.
 */
export function registerWebServer(): void {
  if (!config.webPort) {
    console.log("Public stats page disabled (WEB_PORT=0)");
    return;
  }

  const web = express();

  web.get("/", async (req, res) => {
    const programs = listPrograms();
    if (programs.length === 0) {
      res.type("html").send(pageShell("Hestia", "<h1>Hestia</h1><p>No programs configured yet.</p>"));
      return;
    }

    const requestedId = Number(req.query.program);
    const program = getProgramById(requestedId) ?? programs[0];

    res.type("html").send(await renderProgramPage(program, programs));
  });

  web.listen(config.webPort, () => {
    console.log(`Public stats page listening on :${config.webPort}`);
  });
}
