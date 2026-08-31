import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { UsageCard } from "../components/UsageCard.jsx";

export function Dashboard() {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.getUsage().then(setUsage).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  if (error) return <p className="error-note">{error}</p>;
  if (!usage) return <p className="sch-muted">Loading…</p>;

  return (
    <div className="sch-grid">
      <UsageCard id="CH.01 // CLAUDE CODE" label="Claude Code" provider="claude" entry={usage.claude} onChanged={load} />
      <UsageCard id="CH.02 // CODEX" label="Codex" provider="codex" entry={usage.codex} onChanged={load} />
    </div>
  );
}
