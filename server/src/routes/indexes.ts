import { Router, Request, Response } from "express";
import { decrypt } from "../utils/encryption";
import { findById } from "../utils/connectionStore";
import { activeProviders, getProvider } from "../providers/ProviderRegistry";
import { ConnectionConfig, DatabaseProvider, IndexInfo } from "../types";

const router = Router();

// ---------------------------------------------------------------------------
// Extended provider interface — index management is optional per provider,
// same pattern explorer.ts uses for listViews/listIndexes/listRelationships.
// ---------------------------------------------------------------------------
type IndexCapableProvider = DatabaseProvider & {
  listIndexDetails?: () => Promise<IndexInfo[]>;
  createIndex?: (
    table: string,
    columns: string[],
    options?: { unique?: boolean; name?: string },
  ) => Promise<string>;
  dropIndex?: (name: string, table?: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helper: get (or lazily connect) a provider — same pattern as the other
// route files.
// ---------------------------------------------------------------------------
async function getConnectedProvider(connId: string): Promise<{
  provider: IndexCapableProvider;
  type: string;
}> {
  const existing = activeProviders.get(connId) as IndexCapableProvider | undefined;
  const stored = findById(connId);
  if (!stored) throw Object.assign(new Error("Connection not found"), { status: 404 });

  if (existing) return { provider: existing, type: stored.type };

  let config: ConnectionConfig;
  try {
    config = JSON.parse(decrypt(stored.encryptedConfig)) as ConnectionConfig;
  } catch {
    throw Object.assign(new Error("Failed to decrypt connection config"), { status: 500 });
  }

  const provider = getProvider(stored.type) as IndexCapableProvider;
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

// ---------------------------------------------------------------------------
// GET /api/indexes/:connId
// Returns every index across the database with table/columns/unique info.
// ---------------------------------------------------------------------------
router.get("/:connId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = await getConnectedProvider(req.params.connId);

    if (!provider.listIndexDetails) {
      res.json({ ok: true, indexes: [], supported: false });
      return;
    }

    const indexes = await provider.listIndexDetails();
    res.json({ ok: true, indexes, supported: true });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/indexes/:connId
// Body: { table: string, columns: string[], unique?: boolean, name?: string }
// ---------------------------------------------------------------------------
router.post("/:connId", async (req: Request, res: Response): Promise<void> => {
  const table: string = (req.body?.table as string) ?? "";
  const columns: string[] = Array.isArray(req.body?.columns) ? req.body.columns : [];
  const unique: boolean = Boolean(req.body?.unique);
  const name: string | undefined = req.body?.name;

  if (!table.trim()) {
    res.status(400).json({ ok: false, error: "table is required" });
    return;
  }
  if (columns.length === 0) {
    res.status(400).json({ ok: false, error: "At least one column is required" });
    return;
  }

  try {
    const { provider } = await getConnectedProvider(req.params.connId);

    if (!provider.createIndex) {
      res.status(400).json({ ok: false, error: "This provider doesn't support creating indexes" });
      return;
    }

    const indexName = await provider.createIndex(table, columns, { unique, name });
    res.json({
      ok: true,
      index: { name: indexName, table, columns, unique } as IndexInfo,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/indexes/:connId/:name
// Query: ?table=... — required for MongoDB, where indexes are scoped to a
// specific collection rather than living in one global namespace.
// ---------------------------------------------------------------------------
router.delete("/:connId/:name", async (req: Request, res: Response): Promise<void> => {
  const table = typeof req.query.table === "string" ? req.query.table : undefined;

  try {
    const { provider } = await getConnectedProvider(req.params.connId);

    if (!provider.dropIndex) {
      res.status(400).json({ ok: false, error: "This provider doesn't support dropping indexes" });
      return;
    }

    await provider.dropIndex(req.params.name, table);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
