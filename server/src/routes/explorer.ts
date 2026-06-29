import { Router, Request, Response } from "express";
import { decrypt } from "../utils/encryption";
import { findById } from "../utils/connectionStore";
import { activeProviders, getProvider } from "../providers/ProviderRegistry";
import { ConnectionConfig, DatabaseProvider } from "../types";

const router = Router();

// ---------------------------------------------------------------------------
// Relationship types returned by the /relationships endpoint
// ---------------------------------------------------------------------------
export interface ForeignKeyRelationship {
  /** The table that holds the FK column */
  fromTable: string;
  fromColumn: string;
  /** The referenced (parent) table */
  toTable: string;
  toColumn: string;
  constraintName?: string;
}

// ---------------------------------------------------------------------------
// Extended provider interface for optional explorer extras
// ---------------------------------------------------------------------------
type ProviderWithExtras = DatabaseProvider & {
  listViews?: () => Promise<string[]>;
  listIndexes?: () => Promise<string[]>;
  listRelationships?: () => Promise<ForeignKeyRelationship[]>;
};

// ---------------------------------------------------------------------------
// Helper: resolve + auto-connect a provider
// ---------------------------------------------------------------------------
async function getConnectedProvider(connId: string): Promise<{
  provider: ProviderWithExtras;
  type: string;
  name: string;
}> {
  const existing = activeProviders.get(connId) as ProviderWithExtras | undefined;
  const stored = findById(connId);

  if (!stored) {
    throw Object.assign(new Error("Connection not found"), { status: 404 });
  }

  if (existing) {
    return { provider: existing, type: stored.type, name: stored.name };
  }

  let config: ConnectionConfig;
  try {
    config = JSON.parse(decrypt(stored.encryptedConfig)) as ConnectionConfig;
  } catch {
    throw Object.assign(new Error("Failed to decrypt connection config"), { status: 500 });
  }

  const provider = getProvider(stored.type) as ProviderWithExtras;
  await provider.connect(config);
  activeProviders.set(connId, provider);
  return { provider, type: stored.type, name: stored.name };
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
// GET /api/explorer/:connId/tables
// Returns { tables, views, indexes } for the connected database.
// ---------------------------------------------------------------------------
router.get("/:connId/tables", async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, type, name } = await getConnectedProvider(req.params.connId);
    const [tables, views, indexes] = await Promise.all([
      provider.listTables(),
      provider.listViews?.() ?? Promise.resolve([]),
      provider.listIndexes?.() ?? Promise.resolve([]),
    ]);

    res.json({
      ok: true,
      connection: { id: req.params.connId, name, type },
      tables,
      views,
      indexes,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/explorer/:connId/schema/:table
// Returns column definitions for a single table/collection.
// ---------------------------------------------------------------------------
router.get("/:connId/schema/:table", async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = await getConnectedProvider(req.params.connId);
    const schema = await provider.getSchema(req.params.table);
    res.json({ ok: true, schema });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/explorer/:connId/relationships   — Day 6 addition
//
// Returns all FK relationships for the connected database.
//
// PostgreSQL: queries information_schema.table_constraints + key_column_usage
// SQLite:     calls PRAGMA foreign_key_list(table) for every table
// MongoDB:    not supported — returns an empty array with a note
// ---------------------------------------------------------------------------
router.get("/:connId/relationships", async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, type } = await getConnectedProvider(req.params.connId);

    let relationships: ForeignKeyRelationship[] = [];

    if (type === "postgresql") {
      relationships = await getPostgresRelationships(provider);
    } else if (type === "sqlite") {
      relationships = await getSQLiteRelationships(provider);
    }
    // MongoDB has no FK concept — return empty array

    res.json({ ok: true, relationships });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// PostgreSQL: use information_schema to get FK constraints
// ---------------------------------------------------------------------------
async function getPostgresRelationships(
  provider: ProviderWithExtras,
): Promise<ForeignKeyRelationship[]> {
  const sql = `
    SELECT
      tc.constraint_name,
      kcu.table_name  AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name  AS to_table,
      ccu.column_name AS to_column
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema    = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema    = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = 'public'
    ORDER BY from_table, from_column
  `;

  const result = await provider.query(sql);

  return result.rows.map((row) => ({
    fromTable: String(row["from_table"]),
    fromColumn: String(row["from_column"]),
    toTable: String(row["to_table"]),
    toColumn: String(row["to_column"]),
    constraintName: String(row["constraint_name"]),
  }));
}

// ---------------------------------------------------------------------------
// SQLite: PRAGMA foreign_key_list(table) per table
// ---------------------------------------------------------------------------
async function getSQLiteRelationships(
  provider: ProviderWithExtras,
): Promise<ForeignKeyRelationship[]> {
  const tables = await provider.listTables();
  const relationships: ForeignKeyRelationship[] = [];

  for (const table of tables) {
    const result = await provider.query(`PRAGMA foreign_key_list("${table}")`);
    for (const row of result.rows) {
      relationships.push({
        fromTable: table,
        fromColumn: String(row["from"]),
        toTable: String(row["table"]),
        toColumn: String(row["to"]),
        // SQLite doesn't name FK constraints — use a deterministic id instead
        constraintName: `fk_${table}_${String(row["id"])}`,
      });
    }
  }

  return relationships;
}

export default router;
