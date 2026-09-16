import express from "express";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { apiRouter } from "../api/server";

const DASHBOARD_DIST = path.join(__dirname, "../../dashboard/dist");

/**
 * Serves the Hestia dashboard (a static Vite/React build, see /dashboard) at
 * hestia.matthiaz.dev. The same read-only API routes as API_PORT are mounted
 * here too, under /api, so the dashboard can fetch same-origin with no CORS
 * setup -- api.hestia.matthiaz.dev keeps working unchanged for anyone else.
 * Set WEB_PORT to 0 to turn it off entirely.
 */
export function registerWebServer(): void {
  if (!config.webPort) {
    console.log("Dashboard disabled (WEB_PORT=0)");
    return;
  }

  const web = express();

  web.use(apiRouter());

  if (fs.existsSync(DASHBOARD_DIST)) {
    web.use(express.static(DASHBOARD_DIST));
    // Single-page app: any non-API, non-file route falls back to index.html.
    web.get("*", (_req, res) => {
      res.sendFile(path.join(DASHBOARD_DIST, "index.html"));
    });
  } else {
    web.get("/", (_req, res) => {
      res.type("text/plain").send("hi (dashboard not built -- run `npm run build` in ./dashboard)");
    });
  }

  web.listen(config.webPort, () => {
    console.log(`Dashboard listening on :${config.webPort}`);
  });
}
