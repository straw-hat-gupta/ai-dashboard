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

## Phase 2 — Reset credits ("use a reset" buttons)

**Goal:** each subscription card shows how many saved limit resets are
available (and when they expire), with its **own** button to redeem one —
"Use Claude reset" and "Use Codex reset" are separate actions on separate
cards.

Both providers now hand out occasional resets that refresh your limits on
demand. Neither offers an official API for them, so this phase starts with
verification.

### Codex — looks feasible

- OpenAI's savable rate-limit resets (launched June 2026; Go / Plus / Pro /
  Business) refresh the 5-hour and weekly windows. In official clients the
  redeem button lives in the desktop app / VS Code extension usage summary.
- Community reverse-engineering of the VS Code extension found:
  - `GET /wham/rate-limit-reset-credits` → per-credit `status`,
    `granted_at`, `expires_at`; an `available_count`
  - `POST /wham/rate-limit-reset-credits/consume` with
    `{ credit_id, redeem_request_id }` → `{ code: "reset", windows_reset }`
- Auth would reuse the token `codex login` already stored
  (`~/.codex/auth.json`). Base host is presumably
  `https://chatgpt.com/backend-api` — **to verify**.
- Also check whether `codex app-server` exposes these over JSON-RPC
  (preferred — same mechanism we already use, less likely to break).

### Claude — needs discovery

- Claude offers occasional "Reset for free" grants under Settings → Usage
  (web / Desktop). Each reset targets either the 5-hour or the weekly limit,
  has an expiry, can't be undone, and also restores Claude Code limits.
- It is **not** available in Claude Code (terminal / IDE), and no endpoint
  is documented.
- Discovery steps:
  1. Log the raw `api/oauth/usage` body — it may already list available
     resets (we only parse the windows today).
  2. Watch network calls on claude.ai Settings → Usage when a reset is
     available, to find the list/redeem endpoints.
  3. Check whether those endpoints accept the Claude Code OAuth token or
     require a claude.ai browser session (we don't store cookies, by design).
- **Fallback:** if redeeming needs a browser session, show the count only
  (if readable) and make the button deep-link to
  `claude.ai/settings/usage` instead of redeeming directly.

### Work items

- [ ] Provider adapters gain `listResets()` and `redeemReset(id)`;
      `fetch*Quota()` results include
      `resets: [{ id, kind: "session" | "weekly" | "both", expiresAt }]`.
- [ ] Store reset snapshots so the card can show "1 reset · expires 12 Nov".
- [ ] `POST /api/usage/:provider/resets/:id/redeem` — one route, called by
      a separate button per provider card.
- [ ] UI: button only appears when a reset is available; shows which
      limit(s) it will refresh and current usage, so you don't waste one at
      20%.
- [ ] After redeeming, immediately re-poll that provider so the meters
      update.

### Guardrails (non-negotiable)

- **Never auto-redeem.** Only a human click, followed by a confirm dialog
  ("This uses 1 of 1 Codex resets, can't be undone").
- **Idempotent:** generate `redeem_request_id` once per click and disable
  the button in flight, so a double-click or retry can't burn two resets.
- **Gate behind dashboard auth** (Phase 6) — right now anyone who can reach
  the dashboard could press it. Until auth exists, ship redemption behind
  `ENABLE_RESET_REDEEM=false` by default.
- Undocumented endpoints may change or conflict with provider terms; keep
  each in its isolated adapter and fail closed (hide the button) on any
  unexpected response shape.

### Open questions

- Does `api/oauth/usage` (or `codex app-server`) already report resets?
- Does Claude's redeem accept an OAuth bearer token at all?
- Show resets in the alerting phase too ("reset expiring in 2 days")?

---

## Phase 3 — History & trends

- [ ] Chart of `used_percent` over time per window (data already stored in
      `usage_windows`; `GET /:provider/history/:windowId` exists).
- [ ] **Burn-rate projection** — "at this pace you'll hit the 5-hour limit
      at 15:40", "weekly cap reached ~Thursday".
- [ ] History retention / pruning setting (`HISTORY_DAYS`).

## Phase 4 — Alerts

- [ ] Threshold notifications (e.g. 80% / 95%) and "window has reset"
      pings.
- [ ] Targets: ntfy / Gotify / Discord webhook / generic webhook — all
      self-host friendly.
- [ ] Per-window thresholds, quiet hours, no repeat alerts within a window.
- [ ] "Reset available" / "reset expiring soon" notifications (Phase 2).

## Phase 5 — Accounts & providers

- [ ] Multiple accounts per provider (e.g. personal + work Claude), each
      with its own `HOME` dir and card.
- [ ] Generalize the `provider IN ('claude','codex')` constraint into a
      provider registry so new adapters are one file each.
- [ ] Investigate others with a CLI-exposed quota (e.g. Gemini CLI,
      GitHub Copilot) — only where a stable local mechanism exists.

## Phase 6 — Hardening & ops

- [ ] Optional built-in auth (basic auth / single shared password) for
      people not behind a reverse proxy. **Required before reset
      redemption (Phase 2) is enabled by default.**
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
