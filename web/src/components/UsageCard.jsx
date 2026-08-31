import { useState } from "react";
import { api } from "../api.js";
import { WindowMeter } from "./WindowMeter.jsx";
import { ManualOverrideForm } from "./ManualOverrideForm.jsx";

function formatRelative(sqliteTimestamp) {
  if (!sqliteTimestamp) return "never";
  const iso = sqliteTimestamp.includes("T") ? sqliteTimestamp : `${sqliteTimestamp.replace(" ", "T")}Z`;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

function statusClass(entry) {
  if (entry.status === "ok") {
    const warn = entry.windows.some((w) => w.used_percent != null && w.used_percent >= 85);
    return warn ? "status-warn" : "status-ok";
  }
  if (entry.status === "unavailable") return "status-error";
  return "status-idle";
}

const LOGIN_HINT = {
  claude: {
    cli: "claude",
    loginCmd: "docker compose exec ai-dashboard claude login",
  },
  codex: {
    cli: "codex",
    loginCmd: "docker compose exec ai-dashboard codex login",
  },
};

export function UsageCard({ id, label, provider, entry, onChanged }) {
  const [refreshing, setRefreshing] = useState(false);
  const [showManual, setShowManual] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.refresh(provider);
    } finally {
      setRefreshing(false);
      onChanged();
    }
  }

  const hint = LOGIN_HINT[provider];

  return (
    <section className="sch-frame sch-surface sch-section sch-joint-tl sch-joint-br">
      <div className="channel-head">
        <div>
          <p className="sch-id">{id}</p>
          <p className="channel-plan sch-muted">{entry.planLabel || label}</p>
        </div>
        <span className={`sch-status ${statusClass(entry)}`}>
          <span className="sch-status-dot" />
          <span className="sch-label">{entry.status}</span>
        </span>
      </div>

      {entry.status !== "ok" ? (
        <div className="sch-stack">
          <p className="error-note">{entry.detail || "No usage data yet."}</p>
          <p className="connect-note sch-muted">
            This dashboard doesn't hold its own login — it reads what the official <code>{hint.cli}</code> CLI
            has already signed into, inside this container. Run:
          </p>
          <pre className="code-block">{hint.loginCmd}</pre>
          <p className="connect-note sch-muted">and follow the printed URL in any browser, then check again.</p>
          <button className="sch-button sch-button-secondary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Checking…" : "Check again"}
          </button>
        </div>
      ) : (
        <>
          <div className="window-list">
            {entry.windows.map((w) => (
              <WindowMeter key={w.window_id} window={w} />
            ))}
          </div>

          <div className="channel-footer">
            <span className="sch-label">Checked {formatRelative(entry.checkedAt)}</span>
            <div className="sch-cluster" style={{ gap: ".5rem" }}>
              <button className="sch-button sch-button-quiet" onClick={() => setShowManual((s) => !s)}>
                {showManual ? "Cancel" : "Manual entry"}
              </button>
              <button className="sch-button sch-button-secondary" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {showManual && (
            <ManualOverrideForm
              provider={provider}
              onSaved={() => {
                setShowManual(false);
                onChanged();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
