import { useEffect, useState } from "react";

export function useCountdown(resetAt) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!resetAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resetAt]);

  if (!resetAt) return null;
  const target = new Date(resetAt).getTime();
  const diff = target - now;
  if (Number.isNaN(target)) return null;
  if (diff <= 0) return "00:00:00";

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("ai-dash-theme") || "system");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    localStorage.setItem("ai-dash-theme", theme);
  }, [theme]);

  return [theme, setTheme];
}
