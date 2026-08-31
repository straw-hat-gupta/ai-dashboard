import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Verified against lucas-barake/usagebar (MIT), which does exactly this to
// drive a macOS menu bar widget: run the official `claude` CLI to confirm
// you're signed into a subscription (not an API key), read the OAuth token
// the CLI already stored on disk, and call the same usage endpoint
// claude.ai's own UI calls. Nothing here is Anthropic's documented public
// API — it's the mechanism the CLI's own credential store and `/usage`
// screen rely on, so it moves only when Anthropic changes Claude Code
// itself, not on every claude.ai redesign.

const execFileAsync = promisify(execFile);
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json");

export async function fetchClaudeQuota() {
  let auth;
  try {
    auth = await readAuthStatus();
  } catch (err) {
    return { status: "unavailable", detail: err.message };
  }

  if (!auth.loggedIn) {
    return { status: "unavailable", detail: "Not signed in. Run `claude login` once to sign in." };
  }
  if (auth.authMethod !== "claude.ai") {
    return {
      status: "unavailable",
      detail: `Signed in with ${auth.authMethod || "an API key"}, which has no subscription usage limits.`,
    };
  }

  let token;
  try {
    token = readAccessToken();
  } catch (err) {
    return { status: "unavailable", detail: err.message };
  }

  const result = await fetchUsageWindows(token);
  if (result.error) return { status: "unavailable", detail: result.error };

  return { status: "ok", planLabel: auth.subscriptionType || "Claude", windows: result.windows };
}

async function readAuthStatus() {
  try {
    const { stdout } = await execFileAsync("claude", ["auth", "status", "--json"], { timeout: 15000 });
    const parsed = JSON.parse(stdout);
    return {
      loggedIn: Boolean(parsed.loggedIn),
      authMethod: parsed.authMethod,
      subscriptionType: parsed.subscriptionType,
    };
  } catch (err) {
    throw new Error(describeExecError(err, "claude"));
  }
}

function readAccessToken() {
  let raw;
  try {
    raw = fs.readFileSync(CREDENTIALS_PATH, "utf8");
  } catch {
    throw new Error(`Could not read ${CREDENTIALS_PATH}. Run \`claude login\` to sign in again.`);
  }
  let token;
  try {
    token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
  } catch {
    throw new Error(`${CREDENTIALS_PATH} did not contain valid JSON.`);
  }
  if (!token) throw new Error("Claude's stored credentials did not contain an access token.");
  return token;
}

async function fetchUsageWindows(token, retryDelaysMs = [3000, 15000]) {
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    let res;
    try {
      res = await fetch(USAGE_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
          Accept: "application/json",
        },
      });
    } catch (err) {
      return { error: err.message };
    }

    if (res.status === 200) {
      const body = await res.json();
      return { windows: parseWindows(body) };
    }
    if (res.status === 401 || res.status === 403) {
      return { error: "Claude's saved token was rejected. Run `claude login` once to refresh it." };
    }
    if (res.status === 429) {
      if (attempt < retryDelaysMs.length) {
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
        continue;
      }
      return { error: "Claude's usage endpoint is rate limiting. Try again shortly." };
    }
    return { error: `Claude usage request failed (HTTP ${res.status}).` };
  }
  return { error: "Claude's usage endpoint is rate limiting. Try again shortly." };
}

function parseWindows(body) {
  const windows = [];
  if (body.five_hour?.utilization != null) {
    windows.push({
      id: "session",
      title: "5-hour",
      usedPercent: body.five_hour.utilization,
      windowMinutes: 300,
      resetAt: normalizeResetsAt(body.five_hour.resets_at),
    });
  }
  if (body.seven_day?.utilization != null) {
    windows.push({
      id: "week",
      title: "Weekly",
      usedPercent: body.seven_day.utilization,
      windowMinutes: 10080,
      resetAt: normalizeResetsAt(body.seven_day.resets_at),
    });
  }
  // Per-model weekly caps (e.g. a separate Opus allowance) show up only here,
  // never in seven_day, which is the all-models total.
  for (const limit of body.limits || []) {
    const modelName = limit?.scope?.model?.display_name;
    if (limit.kind === "weekly_scoped" && modelName && limit.percent != null) {
      windows.push({
        id: `week_model_${modelName.toLowerCase().replace(/\s+/g, "_")}`,
        title: `Weekly (${modelName})`,
        usedPercent: limit.percent,
        windowMinutes: 10080,
        resetAt: normalizeResetsAt(limit.resets_at),
      });
    }
  }
  return windows;
}

function normalizeResetsAt(value) {
  if (value == null) return null;
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function describeExecError(err, bin) {
  if (err.code === "ENOENT") return `\`${bin}\` was not found on PATH.`;
  if (err.killed) return `\`${bin}\` did not respond in time.`;
  const stderr = err.stderr?.toString().trim();
  return stderr || err.message;
}
