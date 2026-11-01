# Roadmap

Plans only — nothing here is built yet. Items are grouped into rough phases;
order within a phase isn't a commitment.

Today the dashboard shows **percent of quota used** and **reset time** for
the Claude Code and Codex 5-hour and weekly windows (see `README.md`).

---

## Phase 1 — Token usage per subscription

**Goal:** next to each quota meter, show how many tokens were actually used
in that window — and eventually what "1% of quota" is worth in tokens.

### Why this needs a new data source

The quota endpoints we already call don't return token counts:

| Provider | Current source | What it returns |
|---|---|---|
| Claude | `api.anthropic.com/api/oauth/usage` | `utilization` %, `resets_at` per window |
| Codex | `codex app-server` → `account/rateLimits/read` | `usedPercent`, `resetsAt` per window |

Token counts only exist in the CLIs' **local session logs**, written on
whichever machine you actually code on:

| Provider | Log location | Fields of interest |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | `message.usage.input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `message.model`, `timestamp` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | `token_count` events: input, cached input, output, reasoning tokens; model; timestamp |

(This is the same approach tools like `ccusage` take.)

### The deployment wrinkle

The container runs with `HOME=/data/home`, and its CLIs are only used to
*check quota* — real coding sessions happen elsewhere, so their logs never
reach the container. Two ways to get them in:

1. **Same-host mount (simplest).** If `claude`/`codex` run on the homelab
   host, bind-mount the log dirs read-only:
   ```yaml
   volumes:
     - ~/.claude/projects:/logs/claude:ro
     - ~/.codex/sessions:/logs/codex:ro
   ```
   Configured via new env vars `CLAUDE_LOGS_DIR` / `CODEX_LOGS_DIR`.
2. **Push from dev machines.** A small script (cron / launchd) on each
   machine parses its own logs and `POST`s **aggregated counts only** —
   never prompt or response content — to the dashboard. Authenticated with
   a shared `INGEST_TOKEN`. Needed for laptops or multiple machines.

Plan: build the parser once as a shared module, used by both the in-server
scanner (option 1) and the push script (option 2).

### Work items

- [ ] **Log parsers** — `server/src/tokens/claudeLogs.js`,
      `server/src/tokens/codexLogs.js`. Stream JSONL line by line, tolerate
      malformed/partial lines, normalize to
      `{ provider, ts, model, input, output, cacheWrite, cacheRead, reasoning, source }`.
- [ ] **Dedupe** — Claude logs can repeat a message across resumed sessions;
      key on `message.id` + `requestId` (Codex: file + line offset / event id).
- [ ] **Incremental scanning** — remember per-file byte offset + mtime so
      each poll only reads new lines.
- [ ] **Storage** — new `token_usage` table (raw events or hourly buckets
      per provider × model × machine) plus `token_scan_state` for offsets.
- [ ] **API**
  - `GET /api/usage` gains a `tokens` block per provider: totals for the
    current 5-hour window and current weekly window, aligned to the same
    `resetAt` the quota meters use.
  - `GET /api/tokens/:provider?range=24h|7d|30d&groupBy=hour|day|model`
  - `POST /api/tokens/ingest` (option 2, token-authenticated)
- [ ] **UI** — token totals on each `UsageCard` (in / out / cache split,
      per-model rows), plus a daily bar chart.
- [ ] **Tokens per 1% of quota** — correlate token deltas with
      `used_percent` deltas from `usage_windows` to estimate how big each
      window really is. Clearly labeled as an estimate.
- [ ] **Docs** — README section for both setup options + privacy note.

### Open questions

- Which machines run the CLIs (homelab host, laptop, several)? Decides
  option 1 vs 2 as the default.
- Keep raw events or only hourly buckets? (Buckets = smaller DB, less
  detail.)
- Do subagent / sidechain messages in Claude logs count toward the same
  quota? (Assume yes; verify against `/usage`.)

---

## Phase 2 — History & trends

- [ ] Chart of `used_percent` over time per window (data already stored in
      `usage_windows`; `GET /:provider/history/:windowId` exists).
- [ ] **Burn-rate projection** — "at this pace you'll hit the 5-hour limit
      at 15:40", "weekly cap reached ~Thursday".
- [ ] History retention / pruning setting (`HISTORY_DAYS`).

## Phase 3 — Alerts

- [ ] Threshold notifications (e.g. 80% / 95%) and "window has reset"
      pings.
- [ ] Targets: ntfy / Gotify / Discord webhook / generic webhook — all
      self-host friendly.
- [ ] Per-window thresholds, quiet hours, no repeat alerts within a window.

## Phase 4 — Accounts & providers

- [ ] Multiple accounts per provider (e.g. personal + work Claude), each
      with its own `HOME` dir and card.
- [ ] Generalize the `provider IN ('claude','codex')` constraint into a
      provider registry so new adapters are one file each.
- [ ] Investigate others with a CLI-exposed quota (e.g. Gemini CLI,
      GitHub Copilot) — only where a stable local mechanism exists.

## Phase 5 — Hardening & ops

- [ ] Optional built-in auth (basic auth / single shared password) for
      people not behind a reverse proxy.
- [ ] `/healthz` endpoint + Docker `HEALTHCHECK`.
- [ ] Surface "endpoint shape changed" errors distinctly from auth errors.
- [ ] Pin CLI versions in the Dockerfile with a documented update flow.
- [ ] CSV / JSON export of usage and token history.
- [ ] Tests for the provider adapters and log parsers using recorded
      fixture payloads.

---

## Non-goals

- Tracking chatgpt.com / claude.ai **web chat** usage — no usable data
  source (see README "Scope").
- API-key (pay-as-you-go) billing — that's the providers' own consoles.
- Storing or displaying prompt / response content from session logs.
