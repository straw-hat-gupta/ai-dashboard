import { Router } from "express";
import { getProviderStatus, latestWindows, windowHistory, insertWindowReading } from "../db.js";
import { refreshProvider } from "../refresh.js";

export const usageRouter = Router();

const PROVIDERS = ["claude", "codex"];

usageRouter.get("/", (req, res) => {
  const payload = {};
  for (const provider of PROVIDERS) {
    const status = getProviderStatus(provider);
    payload[provider] = {
      status: status?.status ?? "unknown",
      detail: status?.detail ?? null,
      planLabel: status?.plan_label ?? null,
      checkedAt: status?.checked_at ?? null,
      windows: latestWindows(provider),
    };
  }
  res.json(payload);
});

usageRouter.get("/:provider/history/:windowId", (req, res) => {
  const { provider, windowId } = req.params;
  if (!PROVIDERS.includes(provider)) return res.status(404).json({ message: "Unknown provider" });
  res.json(windowHistory(provider, windowId, Number(req.query.limit) || 200));
});

usageRouter.post("/:provider/refresh", async (req, res) => {
  const { provider } = req.params;
  if (!PROVIDERS.includes(provider)) return res.status(404).json({ message: "Unknown provider" });
  const result = await refreshProvider(provider);
  res.json(result);
});

usageRouter.post("/:provider/manual", (req, res) => {
  const { provider } = req.params;
  if (!PROVIDERS.includes(provider)) return res.status(404).json({ message: "Unknown provider" });
  const { windowId, title, usedPercent, windowMinutes, resetAt } = req.body || {};
  if (!windowId) return res.status(400).json({ message: "windowId is required" });
  insertWindowReading(
    provider,
    { id: windowId, title, usedPercent, windowMinutes, resetAt },
    "manual"
  );
  res.json({ status: "ok" });
});
