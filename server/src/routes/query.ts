import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { queryGuard } from "../middleware/queryGuard";
import { decrypt } from "../utils/encryption";
import { findById } from "../utils/connectionStore";
import { activeProviders, getProvider } from "../providers/ProviderRegistry";
import { appendHistory, getHistory, clearHistory } from "../utils/queryHistory";
import { ConnectionConfig, DatabaseProvider } from "../types";
import { MongoClient, ObjectId } from "mongodb";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getConnectedProvider(connId: string): Promise<{
  provider: DatabaseProvider;
  type: string;
}> {
  const existing = activeProviders.get(connId);
  const stored = findById(connId);
  if (!stored) throw Object.assign(new Error("Connection not found"), { status: 404 });

  if (existing) return { provider: existing, type: stored.type };

  let config: ConnectionConfig;
  try {
    config = JSON.parse(decrypt(stored.encryptedConfig)) as ConnectionConfig;
  } catch {
    throw Object.assign(new Error("Failed to decrypt connection config"), { status: 500 });
  }

  const provider = getProvider(stored.type);
  await provider.connect(config);
  activeProviders.set(connId, provider);
  return { provider, type: stored.type };
}

function sendError(res: Response, error: unknown): void {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 500;
  const message = error instanceof Error ? error.message : String(error);
  res.status(Number.isFinite(status) ? status : 500).json({ ok: false, error: message });
}

/**
 * Parse a simplified MongoDB shell-style expression:
 *   db.collectionName.find({ ... })
 *   db.collectionName.find({ ... }).limit(N)
 *
 * Returns { collection, method, filterJson } or null if not matched.
 */
function parseMongoExpression(expr: string): {
  collection: string;
  method: string;
  filterJson: string;
} | null {
  const match = expr
    .trim()
    .match(/^db\.(\w+)\.(find|findOne|countDocuments|aggregate)\s*\(([^]*)\)\s*(?:\.limit\(\d+\))?$/);
  if (!match) return null;
  return { collection: match[1], method: match[2], filterJson: match[3].trim() };
}

function serializeMongoDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(doc).map(([k, v]) => [
      k,
      v instanceof ObjectId ? v.toHexString() : v instanceof Date ? v.toISOString() : v,
    ]),
  );
}

// ---------------------------------------------------------------------------
// POST /api/query/:connId
// Body: { query: string }
// ---------------------------------------------------------------------------
router.post("/:connId", queryGuard, async (req: Request, res: Response): Promise<void> => {
  const { connId } = req.params;
  const queryText: string = (req.body?.query as string) ?? "";

  if (!queryText.trim()) {
    res.status(400).json({ ok: false, error: "query is required" });
    return;
  }

  let provider: DatabaseProvider;
  let dbType: string;
  try {
    ({ provider, type: dbType } = await getConnectedProvider(connId));
  } catch (err) {
    sendError(res, err);
    return;
  }

  const start = Date.now();

  // ---- MongoDB path -------------------------------------------------------
  if (dbType === "mongodb") {
    const parsed = parseMongoExpression(queryText);
    if (!parsed) {
      res.status(400).json({
        ok: false,
        error:
          'Unsupported syntax. Use: db.collection.find({}) or db.collection.aggregate([...])',
      });
      return;
    }

    const stored = findById(connId)!;
    let config: ConnectionConfig;
    try {
      config = JSON.parse(decrypt(stored.encryptedConfig)) as ConnectionConfig;
    } catch {
      res.status(500).json({ ok: false, error: "Failed to decrypt connection config" });
      return;
    }

    // Use a fresh client for raw query access (MongoProvider doesn't expose db directly)
    const client = new MongoClient(config.uri!);
    try {
      await client.connect();
      const db = client.db();
      const col = db.collection(parsed.collection);

      let filter: Record<string, unknown> = {};
      try {
        filter = parsed.filterJson ? (JSON.parse(parsed.filterJson) as Record<string, unknown>) : {};
      } catch {
        // Non-JSON filter — leave empty and continue
      }

      let rawRows: Record<string, unknown>[];
      let rowCount: number;

      if (parsed.method === "countDocuments") {
        rowCount = await col.countDocuments(filter);
        rawRows = [{ count: rowCount }];
      } else if (parsed.method === "findOne") {
        const doc = await col.findOne(filter);
        rawRows = doc ? [serializeMongoDoc(doc as Record<string, unknown>)] : [];
        rowCount = rawRows.length;
      } else if (parsed.method === "aggregate") {
        let pipeline: Record<string, unknown>[] = [];
        try {
          pipeline = JSON.parse(parsed.filterJson) as Record<string, unknown>[];
        } catch { /* use empty pipeline */ }
        const docs = await col.aggregate(pipeline).toArray();
        rawRows = docs.map((d) => serializeMongoDoc(d as Record<string, unknown>));
        rowCount = rawRows.length;
      } else {
        // find
        const docs = await col.find(filter).limit(500).toArray();
        rawRows = docs.map((d) => serializeMongoDoc(d as Record<string, unknown>));
        rowCount = rawRows.length;
      }

      const executionTimeMs = Date.now() - start;
      const columns = rawRows.length ? Object.keys(rawRows[0]) : [];

      appendHistory(connId, {
        id: randomUUID(),
        query: queryText,
        executedAt: new Date().toISOString(),
        executionTimeMs,
        rowCount,
      });

      res.json({ ok: true, columns, rows: rawRows, rowCount, executionTimeMs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendHistory(connId, {
        id: randomUUID(),
        query: queryText,
        executedAt: new Date().toISOString(),
        executionTimeMs: Date.now() - start,
        rowCount: 0,
        error: msg,
      });
      res.status(500).json({ ok: false, error: msg });
    } finally {
      await client.close();
    }
    return;
  }

  // ---- SQL path (SQLite / PostgreSQL) -------------------------------------
  try {
    const result = await provider.query(queryText);
    const executionTimeMs = Date.now() - start;

    appendHistory(connId, {
      id: randomUUID(),
      query: queryText,
      executedAt: new Date().toISOString(),
      executionTimeMs,
      rowCount: result.rowCount,
    });

    res.json({
      ok: true,
      columns: result.fields ?? (result.rows.length ? Object.keys(result.rows[0]) : []),
      rows: result.rows,
      rowCount: result.rowCount,
      executionTimeMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendHistory(connId, {
      id: randomUUID(),
      query: queryText,
      executedAt: new Date().toISOString(),
      executionTimeMs: Date.now() - start,
      rowCount: 0,
      error: msg,
    });
    res.status(500).json({ ok: false, error: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /api/query/:connId/history
// ---------------------------------------------------------------------------
router.get("/:connId/history", (req: Request, res: Response) => {
  const stored = findById(req.params.connId);
  if (!stored) {
    res.status(404).json({ ok: false, error: "Connection not found" });
    return;
  }
  res.json({ ok: true, history: getHistory(req.params.connId) });
});

// ---------------------------------------------------------------------------
// DELETE /api/query/:connId/history  — clear history for a connection
// ---------------------------------------------------------------------------
router.delete("/:connId/history", (req: Request, res: Response) => {
  const stored = findById(req.params.connId);
  if (!stored) {
    res.status(404).json({ ok: false, error: "Connection not found" });
    return;
  }
  clearHistory(req.params.connId);
  res.json({ ok: true });
});

export default router;
