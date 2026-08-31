import cron from "node-cron";
import { POLL_CRON } from "./config.js";
import { refreshAll } from "./refresh.js";

export function startScheduler() {
  cron.schedule(POLL_CRON, () => {
    refreshAll().catch((err) => console.error("[scheduler] refresh failed", err));
  });
  // Kick off an initial read shortly after boot so the dashboard isn't blank
  // while waiting for the first cron tick.
  setTimeout(() => {
    refreshAll().catch((err) => console.error("[scheduler] initial refresh failed", err));
  }, 3000);
}
