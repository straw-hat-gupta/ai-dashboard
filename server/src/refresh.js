import { setProviderStatus, insertWindowReading } from "./db.js";
import { fetchClaudeQuota } from "./providers/claudeQuota.js";
import { fetchCodexQuota } from "./providers/codexQuota.js";

const FETCHERS = {
  claude: fetchClaudeQuota,
  codex: fetchCodexQuota,
};

export async function refreshProvider(provider) {
  const result = await FETCHERS[provider]();

  setProviderStatus({
    provider,
    status: result.status,
    detail: result.detail ?? null,
    planLabel: result.planLabel ?? null,
  });

  if (result.status === "ok") {
    for (const window of result.windows) {
      insertWindowReading(provider, window, "probe");
    }
  }

  return result;
}

export async function refreshAll() {
  const results = {};
  for (const provider of Object.keys(FETCHERS)) {
    results[provider] = await refreshProvider(provider);
  }
  return results;
}
