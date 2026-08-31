import path from "node:path";
import fs from "node:fs";

export const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "../data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// When HOME is pointed into the data volume (see docker-compose.yml), make
// sure it exists before `claude`/`codex` try to write their config into it.
if (process.env.HOME) {
  fs.mkdirSync(process.env.HOME, { recursive: true });
}

export const PORT = Number(process.env.PORT || 4200);
export const POLL_CRON = process.env.POLL_CRON || "*/5 * * * *";

export const DB_PATH = path.join(DATA_DIR, "dashboard.db");
