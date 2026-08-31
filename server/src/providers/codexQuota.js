import { spawn } from "node:child_process";

// Verified against lucas-barake/usagebar (MIT): `codex app-server` speaks
// newline-delimited JSON-RPC over stdio (not LSP-style Content-Length
// framing). It stays running until stdin closes, so we send an
// `initialize` call, an `initialized` notification, then
// `account/rateLimits/read`, and read stdout lines until one comes back
// tagged with our request id.

const RATE_LIMITS_REQUEST_ID = 2;

export async function fetchCodexQuota() {
  let responseLine;
  try {
    responseLine = await runRateLimitsRequest();
  } catch (err) {
    return { status: "unavailable", detail: err.message };
  }

  let parsed;
  try {
    parsed = JSON.parse(responseLine);
  } catch {
    return { status: "unavailable", detail: "Could not read the Codex usage response." };
  }

  if (parsed.error) {
    return { status: "unavailable", detail: parsed.error.message || "Codex refused the usage request." };
  }
  const snapshot = parsed.result?.rateLimits;
  if (!snapshot) {
    return { status: "unavailable", detail: "Codex returned no usage data." };
  }

  const windows = [];
  if (snapshot.primary) windows.push(toWindow("session", "5-hour", snapshot.primary));
  if (snapshot.secondary) windows.push(toWindow("week", "Weekly", snapshot.secondary));
  if (!windows.length) {
    return { status: "unavailable", detail: "No usage limits reported yet. Run `codex` once." };
  }

  return { status: "ok", planLabel: snapshot.planType || "Codex", windows };
}

function toWindow(id, title, window) {
  return {
    id,
    title,
    usedPercent: window.usedPercent,
    windowMinutes: window.windowDurationMins ?? null,
    resetAt: window.resetsAt != null ? new Date(window.resetsAt * 1000).toISOString() : null,
  };
}

function runRateLimitsRequest(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn("codex", ["app-server"], { stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      reject(err.code === "ENOENT" ? new Error("`codex` was not found on PATH.") : err);
      return;
    }

    let settled = false;
    let buffer = "";
    let stderr = "";

    const timer = setTimeout(() => {
      settle(() => reject(new Error("`codex app-server` did not respond in time.")));
    }, timeoutMs);

    function settle(action) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      action();
    }

    child.on("error", (err) => {
      settle(() =>
        reject(err.code === "ENOENT" ? new Error("`codex` was not found on PATH.") : err)
      );
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.id === RATE_LIMITS_REQUEST_ID) {
          settle(() => resolve(line));
          return;
        }
      }
    });

    child.on("close", () => {
      settle(() => reject(new Error(stderr.trim() || "`codex app-server` exited before responding.")));
    });

    const requestLines = [
      { id: 1, method: "initialize", params: { clientInfo: { name: "ai-usage-dashboard", version: "0.1.0" } } },
      { method: "initialized", params: {} },
      { id: RATE_LIMITS_REQUEST_ID, method: "account/rateLimits/read", params: {} },
    ];
    for (const line of requestLines) {
      child.stdin.write(JSON.stringify(line) + "\n");
    }
  });
}
