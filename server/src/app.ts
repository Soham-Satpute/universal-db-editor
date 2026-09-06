import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

import connectionsRouter from "./routes/connections";
import explorerRouter from "./routes/explorer";
import queryRouter from "./routes/query";
import crudRouter from "./routes/crud";
import exportRouter from "./routes/export";
import importRouter from "./routes/import";
import aiRouter from "./routes/ai";
import indexesRouter from "./routes/indexes";

dotenv.config();

/**
 * The configured Express app, with no `listen()` call attached.
 *
 * Split out from index.ts (Day 7) so the test suite — and anything
 * else that wants an in-process app instance, e.g. supertest — can
 * import `app` directly instead of spinning up a real HTTP server
 * on a real port.
 */
export const app = express();

// Security headers — Day 6 addition
app.use(
  helmet({
    // Allow the Vite dev server (localhost:5173) to load resources from this API
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(cors());
app.use(express.json());

app.use("/api/connections", connectionsRouter);
app.use("/api/explorer", explorerRouter);
app.use("/api/query", queryRouter);
app.use("/api/crud", crudRouter);
app.use("/api/export", exportRouter);
app.use("/api/import", importRouter);
app.use("/api/ai", aiRouter);
app.use("/api/indexes", indexesRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "universal-db-editor-server" });
});

export default app;
