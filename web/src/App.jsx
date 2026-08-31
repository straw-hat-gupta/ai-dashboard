import { Dashboard } from "./pages/Dashboard.jsx";
import { useTheme } from "./hooks.js";

export default function App() {
  const [theme, setTheme] = useTheme();

  return (
    <div className="sch-app app-shell sch-dot-bg">
      <header className="app-header">
        <h1 className="app-title">
          AI USAGE <span className="sch-muted">/ DASHBOARD</span>
        </h1>
        <button
          className="sch-button sch-button-quiet theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          aria-label="Toggle theme"
        >
          <span className="sch-label">{theme}</span>
        </button>
      </header>
      <main className="app-main">
        <Dashboard />
      </main>
    </div>
  );
}
