import { useState } from "react";
import { api } from "../api.js";

export function ManualOverrideForm({ provider, onSaved }) {
  const [windowId, setWindowId] = useState("session");
  const [usedPercent, setUsedPercent] = useState("");
  const [resetAt, setResetAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.manualUpdate(provider, {
        windowId,
        title: windowId === "session" ? "5-hour" : "Weekly",
        usedPercent: Number(usedPercent),
        resetAt: resetAt ? new Date(resetAt).toISOString() : null,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="connect-form" onSubmit={submit} style={{ marginTop: "1rem" }}>
      <p className="connect-note sch-muted">
        Read the numbers off <code>{provider === "claude" ? "claude" : "codex"} /status</code> (or the CLI's
        own usage screen) and drop them in here while the automated read is down.
      </p>
      <label>
        <span className="field-label sch-label">Window</span>
        <select className="sch-select" value={windowId} onChange={(e) => setWindowId(e.target.value)}>
          <option value="session">5-hour session</option>
          <option value="week">Weekly</option>
        </select>
      </label>
      <label>
        <span className="field-label sch-label">Used %</span>
        <input
          className="sch-input"
          type="number"
          min="0"
          max="100"
          required
          value={usedPercent}
          onChange={(e) => setUsedPercent(e.target.value)}
        />
      </label>
      <label>
        <span className="field-label sch-label">Resets at</span>
        <input
          className="sch-input"
          type="datetime-local"
          value={resetAt}
          onChange={(e) => setResetAt(e.target.value)}
        />
      </label>
      <button className="sch-button sch-button-primary" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
