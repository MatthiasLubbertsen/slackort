import express from "express";
import { config } from "../config";

/**
 * A placeholder page for hestia.matthiaz.dev. Just says hi for now, swap in
 * something real later. Set WEB_PORT to 0 to turn it off entirely.
 */
export function registerWebServer(): void {
  if (!config.webPort) {
    console.log("Placeholder web page disabled (WEB_PORT=0)");
    return;
  }

  const web = express();

  web.get("/", (_req, res) => {
    res.type("text/plain").send("hi");
  });

  web.listen(config.webPort, () => {
    console.log(`Placeholder page listening on :${config.webPort}`);
  });
}
