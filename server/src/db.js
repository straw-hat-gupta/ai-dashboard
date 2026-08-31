import Database from "better-sqlite3";
import { DB_PATH } from "./config.js";

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS provider_status (
    provider TEXT PRIMARY KEY CHECK (provider IN ('claude', 'codex')),
    status TEXT NOT NULL DEFAULT 'unknown',
    detail TEXT,
    plan_label TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_windows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    window_id TEXT NOT NULL,
    title TEXT,
    used_percent REAL,
    window_minutes INTEGER,
    reset_at TEXT,
    source TEXT NOT NULL DEFAULT 'probe',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_usage_windows_lookup
    ON usage_windows (provider, window_id, fetched_at DESC);
`);

export function setProviderStatus({ provider, status, detail, planLabel }) {
  db.prepare(
    `INSERT INTO provider_status (provider, status, detail, plan_label, checked_at)
     VALUES (@provider, @status, @detail, @planLabel, datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET
       status = excluded.status,
       detail = excluded.detail,
       plan_label = excluded.plan_label,
       checked_at = datetime('now')`
  ).run({ provider, status, detail: detail ?? null, planLabel: planLabel ?? null });
}

export function getProviderStatus(provider) {
  return db.prepare(`SELECT * FROM provider_status WHERE provider = ?`).get(provider);
}

export function insertWindowReading(provider, window, source = "probe") {
  db.prepare(
    `INSERT INTO usage_windows (provider, window_id, title, used_percent, window_minutes, reset_at, source)
     VALUES (@provider, @windowId, @title, @usedPercent, @windowMinutes, @resetAt, @source)`
  ).run({
    provider,
    windowId: window.id,
    title: window.title ?? null,
    usedPercent: window.usedPercent ?? null,
    windowMinutes: window.windowMinutes ?? null,
    resetAt: window.resetAt ?? null,
    source,
  });
}

// Latest reading per distinct window_id (session, week, week_model_*, ...).
export function latestWindows(provider) {
  return db
    .prepare(
      `SELECT w.* FROM usage_windows w
       INNER JOIN (
         SELECT window_id, MAX(fetched_at) AS max_fetched
         FROM usage_windows WHERE provider = ? GROUP BY window_id
       ) latest ON w.window_id = latest.window_id AND w.fetched_at = latest.max_fetched
       WHERE w.provider = ?
       ORDER BY w.window_minutes ASC`
    )
    .all(provider, provider);
}

export function windowHistory(provider, windowId, limit = 200) {
  return db
    .prepare(
      `SELECT * FROM usage_windows WHERE provider = ? AND window_id = ? ORDER BY fetched_at DESC LIMIT ?`
    )
    .all(provider, windowId, limit);
}
