import { useCountdown } from "../hooks.js";

function formatResetLabel(resetAt, countdown) {
  if (!resetAt) return "unknown";
  return countdown ?? "unknown";
}

export function WindowMeter({ window }) {
  const countdown = useCountdown(window.reset_at);
  const pct = window.used_percent == null ? null : Math.max(0, Math.min(100, window.used_percent));

  return (
    <div className="window-meter">
      <div className="window-meter-head">
        <span className="sch-label">{window.title || window.window_id}</span>
        <span className="sch-value window-meter-pct">{pct == null ? "—" : `${Math.round(pct)}%`}</span>
      </div>
      <div className="sch-progress">
        <div className="sch-progress-bar" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <div className="window-meter-foot">
        <span className="sch-label">Resets</span>
        <span className="sch-muted window-meter-reset">{formatResetLabel(window.reset_at, countdown)}</span>
      </div>
    </div>
  );
}
