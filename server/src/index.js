import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { PORT } from "./config.js";
import "./db.js";
import { usageRouter } from "./routes/usage.js";
import { startScheduler } from "./scheduler.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/usage", usageRouter);

const webDist = path.resolve(process.cwd(), "../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`ai-dashboard server listening on :${PORT}`);
  startScheduler();
});
