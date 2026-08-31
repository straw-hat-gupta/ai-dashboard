# AI Usage Dashboard

A self-hosted, single-page dashboard that tracks your Claude Code and Codex
CLI subscription usage: 5-hour and weekly quota, and when each resets.

## Scope: Claude Code / Codex, not chatgpt.com / claude.ai chat

Neither OpenAI nor Anthropic publishes a usage API for the ordinary web/app
chat experience. What *is* available is what the official `claude` and
`codex` CLIs already use internally to power their own `/status` and usage
screens — and that's what this dashboard reads. If you mainly use the
chatgpt.com / claude.ai web apps rather than these CLIs, this dashboard
won't have anything to show you.

## How it works

No browser automation, no stored passwords — this dashboard doesn't log in
to anything itself. It shells out to CLIs that are already authenticated:

- **Claude**: runs `claude auth status --json` to confirm you're signed in
  with a claude.ai subscription (not an API key), reads the OAuth token
  Claude Code already stored on disk, and calls the same usage endpoint
  Claude Code's own `/usage` screen calls
  (`api.anthropic.com/api/oauth/usage`).
- **Codex**: starts `codex app-server` (a small JSON-RPC process the Codex
  CLI ships with) and asks it `account/rateLimits/read`, the same call the
  CLI uses for `/status`.

Both mechanisms — and the parsing code — are adapted from
[lucas-barake/usagebar](https://github.com/lucas-barake/usagebar) (MIT), an
open-source macOS menu bar app that does the same thing; its Swift source is
what makes this reliable enough to build on rather than another layer of
guesswork.

A background job re-checks both every 5 minutes (`POLL_CRON`) and stores
each reading in SQLite, so the dashboard loads instantly and keeps a small
history even between checks.

## First-time setup: log in to the CLIs, not the dashboard

There's no login screen in this app. Instead, once the container is
running, authenticate the CLIs inside it:

```bash
docker compose up -d --build
docker compose exec ai-dashboard claude login
docker compose exec ai-dashboard codex login
```

Each prints a URL (and sometimes a code) — open it in any browser, on any
device, to finish signing in. Nothing needs to be typed back into the
terminal. Once both are done, refresh the dashboard.

This container's `$HOME` is pointed at the mounted data volume
(`docker-compose.yml`'s `HOME=/data/home`), so its Claude/Codex login is
completely separate from any account logged in elsewhere on your homelab —
exactly the point of running this in its own container.

## Running it (Docker / homelab)

```bash
git clone <this repo> ai-dashboard
cd ai-dashboard
docker compose up -d --build
```

Open `http://<your-server>:4200`, then do the two `docker compose exec …
login` commands above. Usage history and CLI credentials live in `./data`
on the host, so they survive rebuilds — back it up if you don't want to
redo the logins, but treat it like a credentials store (it holds live
session tokens for both accounts).

Config lives in environment variables — see `docker-compose.yml` /
`.env.example`:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4200` | Port the dashboard listens on |
| `POLL_CRON` | `*/5 * * * *` | How often to re-check usage |
| `DATA_DIR` | `/data` | Where the SQLite DB lives |
| `HOME` | `/data/home` | Where `claude`/`codex` store their own login (Docker only) |

## Running it locally without Docker

```bash
npm install -g @anthropic-ai/claude-code @openai/codex
claude login
codex login

# backend
cd server && npm install && npm run dev

# frontend (separate terminal)
cd web && npm install && npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:4200`. Locally the
CLIs use your normal `$HOME`, so this reads whatever account you're already
logged into.

## What each card shows

- **5-hour** window: the short-term burst allowance both plans use.
- **Weekly** window: the longer allowance. Claude also reports separate
  weekly caps for individual models (e.g. a distinct Opus allowance) when
  your account has one — these show as extra rows.
- **Manual entry**: if the automated read ever breaks (see below), each
  card has a fallback to type in what the CLI's own `/status` shows.

## Troubleshooting

**Claude card says "Could not read ~/.claude/.credentials.json"** — this is
expected on macOS, where Claude Code stores the token in the Keychain
instead of a file; it's only meant to work inside the Linux container.
Inside the container, run `claude login` (not just `claude`) and confirm
the file exists: `docker compose exec ai-dashboard cat /data/home/.claude/.credentials.json`.
If Claude Code changes where/how it stores this token, update
`CREDENTIALS_PATH` in `server/src/providers/claudeQuota.js`.

**Claude card says "Signed in with ... which has no subscription usage
limits"** — you're authenticated with an API key rather than a claude.ai
account. API billing is separate from subscription quota and isn't what
this dashboard tracks.

**Codex card says "`codex` was not found on PATH"** — the CLI didn't
install correctly in the image; check the `docker compose build` logs for
the `npm install -g` step.

**Either endpoint changes shape upstream** — both provider adapters
(`server/src/providers/claudeQuota.js`, `codexQuota.js`) are small,
isolated, and comment-documented against the exact request/response shape
they expect. If Anthropic or OpenAI change it, that's the one file to fix;
nothing else in the app needs to know.

## Security notes

- No passwords ever pass through this app — `claude login` / `codex login`
  are the CLIs' own official OAuth flows.
- `data/` holds live session credentials for both accounts once you log in.
  Protect it like any other credentials store.
- The dashboard itself has no login of its own — keep it off the public
  internet (reverse proxy with auth, or a VPN like Tailscale, if you need
  remote access).
