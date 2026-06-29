import { Router, Request, Response } from "express";
import { decrypt } from "../utils/encryption";
import { findById } from "../utils/connectionStore";
import { activeProviders, getProvider } from "../providers/ProviderRegistry";
import { ConnectionConfig, DatabaseProvider, SchemaInfo } from "../types";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: get (and lazily connect) a provider for a given connection id.
// Reuses the same activeProviders map used by the explorer routes.
// ---------------------------------------------------------------------------
async function getConnectedProvider(connId: string): Promise<{
  provider: DatabaseProvider;
  type: string;
}> {
  const existing = activeProviders.get(connId);
  const stored = findById(connId);

  if (!stored) {
    throw Object.assign(new Error("Connection not found"), { status: 404 });
  }

  if (existing) {
    return { provider: existing, type: stored.type };
  }

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

// ---------------------------------------------------------------------------
// Detect primary key for a table.
// Returns the first PK column name, or falls back to "id" / "_id".
// ---------------------------------------------------------------------------
async function getPrimaryKey(provider: DatabaseProvider, table: string, dbType: string): Promise<string> {
  try {
    const schema: SchemaInfo = await provider.getSchema(table);
    const pkCol = schema.columns.find((c) => c.isPrimaryKey);
    if (pkCol) return pkCol.name;
  } catch {
    // schema fetch failed — use defaults
  }
  return dbType === "mongodb" ? "_id" : "id";
}

// ---------------------------------------------------------------------------
// Build a search-aware QueryOptions object from the request query string.
//
// ?page=1&limit=50&sort=name&order=asc&search=john
//
// "search" does a case-insensitive LIKE/regex on every text column.
// We push that down into provider.findRecords() via options.search so that
// providers can handle it in the most efficient way for their engine.
// ---------------------------------------------------------------------------
function parseQueryOptions(query: Request["query"], schema?: SchemaInfo) {
  const page = Number(query.page ?? 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
  const sortField = typeof query.sort === "string" ? query.sort : undefined;
  const sortOrder = query.order === "desc" ? "desc" : "asc";
  const search = typeof query.search === "string" && query.search.trim() ? query.search.trim() : undefined;

  // Build a partial filter from "search" by targeting string columns only.
  // Providers that support it can extend this. For a generic filter map we
  // just pass search separately and let each provider handle it.
  return {
    page,
    limit,
    sort: sortField ? { field: sortField, direction: sortOrder as "asc" | "desc" } : undefined,
    filter: {},
    search,
    schema,
  };
}

// ---------------------------------------------------------------------------
// SQLite-specific paginated search using LIKE on all text columns
// ---------------------------------------------------------------------------
async function findRecordsWithSearch(
  provider: DatabaseProvider,
  table: string,
  dbType: string,
  options: ReturnType<typeof parseQueryOptions>
) {
  // If no search term, delegate directly to provider.findRecords()
  if (!options.search) {
    return provider.findRecords(table, {
      page: options.page,
      limit: options.limit,
      sort: options.sort,
      filter: options.filter,
    });
  }

  const search = options.search;

  // MongoDB: use a text filter that provider.findRecords accepts via $or regex
  if (dbType === "mongodb") {
    // Pass search as a special $text-style filter; MongoProvider.findRecords
    // receives it via the filter bag — we use a sentinel key the Mongo driver won't
    // reject: we override findRecords by building the mongo filter here.
    // Since we can't easily extend the generic QueryOptions for this, we cast
    // the provider to its concrete type and build the $or filter ourselves.
    const cols = options.schema?.columns.map((c) => c.name) ?? [];
    const orFilter = cols.length
      ? { $or: cols.map((name) => ({ [name]: { $regex: search, $options: "i" } })) }
      : {};
    return provider.findRecords(table, {
      page: options.page,
      limit: options.limit,
      sort: options.sort,
      filter: orFilter as Record<string, unknown>,
    });
  }

  // SQL databases: use the provider.query() method to run a LIKE query.
  // We build it by fetching the schema first to know string columns.
  const schema = options.schema;
  if (!schema || schema.columns.length === 0) {
    // Fallback: no search, just paginate.
    return provider.findRecords(table, { page: options.page, limit: options.limit, sort: options.sort });
  }

  const textTypes = new Set(["text", "varchar", "character varying", "char", "nvarchar", "string", "unknown"]);
  const textCols = schema.columns.filter((c) => textTypes.has(c.type.toLowerCase().split("(")[0]));

  if (textCols.length === 0) {
    return provider.findRecords(table, { page: options.page, limit: options.limit, sort: options.sort });
  }

  const { page, limit, sort } = options;
  const offset = (Math.max(1, page) - 1) * limit;
  const isPostgres = dbType === "postgresql";

  if (isPostgres) {
    const quotePg = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const likeFragments = textCols.map((c) => `CAST(${quotePg(c.name)} AS TEXT) ILIKE $1`);
    const where = `WHERE (${likeFragments.join(" OR ")})`;
    const orderClause = sort ? `ORDER BY ${quotePg(sort.field)} ${sort.direction.toUpperCase()}` : "";
    const param = `%${search}%`;

    const [dataResult, countResult] = await Promise.all([
      provider.query(
        `SELECT * FROM ${quotePg(table)} ${where} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
        [param]
      ),
      provider.query(`SELECT COUNT(*) AS total FROM ${quotePg(table)} ${where}`, [param]),
    ]);

    const total = Number(countResult.rows[0]?.total ?? dataResult.rows.length);
    return { rows: dataResult.rows, total, page, limit };
  } else {
    // SQLite — LIKE is case-insensitive for ASCII by default
    const quoteSqlite = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const likeFragments = textCols.map((c) => `CAST(${quoteSqlite(c.name)} AS TEXT) LIKE ?`);
    const where = `WHERE (${likeFragments.join(" OR ")})`;
    const orderClause = sort ? `ORDER BY ${quoteSqlite(sort.field)} ${sort.direction.toUpperCase()}` : "";
    const param = `%${search}%`;
    const likeParams = textCols.map(() => param);

    const [dataResult, countResult] = await Promise.all([
      provider.query(
        `SELECT * FROM ${quoteSqlite(table)} ${where} ${orderClause} LIMIT ? OFFSET ?`,
        [...likeParams, limit, offset]
      ),
      provider.query(`SELECT COUNT(*) AS total FROM ${quoteSqlite(table)} ${where}`, likeParams),
    ]);

    const total = Number(countResult.rows[0]?.total ?? dataResult.rows.length);
    return { rows: dataResult.rows, total, page, limit };
  }
}

// ---------------------------------------------------------------------------
// GET /api/crud/:connId/:table
// Query params: page, limit, sort, order, search
// ---------------------------------------------------------------------------
router.get("/:connId/:table", async (req: Request, res: Response): Promise<void> => {
  try {
    const { connId, table } = req.params;
    const { provider, type } = await getConnectedProvider(connId);

    // Fetch schema so we can build search queries against string columns
    let schema: SchemaInfo | undefined;
    try {
      schema = await provider.getSchema(table);
    } catch {
      // Schema fetch not critical — we'll skip search or fall back
    }

    const options = parseQueryOptions(req.query, schema);
    const result = await findRecordsWithSearch(provider, table, type, options);

    res.json({
      ok: true,
      rows: result.rows,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/crud/:connId/:table
// Body: the record fields to insert (JSON object)
// ---------------------------------------------------------------------------
router.post("/:connId/:table", async (req: Request, res: Response): Promise<void> => {
  try {
    const { connId, table } = req.params;
    const data = req.body as Record<string, unknown>;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      res.status(400).json({ ok: false, error: "Request body must be a JSON object" });
      return;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ ok: false, error: "Cannot insert an empty record" });
      return;
    }

    const { provider } = await getConnectedProvider(connId);
    await provider.insertRecord(table, data);
    res.status(201).json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/crud/:connId/:table/:id
// Body: the fields to update (JSON object, partial allowed)
// ---------------------------------------------------------------------------
router.put("/:connId/:table/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { connId, table, id } = req.params;
    const data = req.body as Record<string, unknown>;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      res.status(400).json({ ok: false, error: "Request body must be a JSON object" });
      return;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ ok: false, error: "No fields provided to update" });
      return;
    }

    const { provider, type } = await getConnectedProvider(connId);
    const pkCol = await getPrimaryKey(provider, table, type);

    // Remove the PK from the update payload to avoid accidentally overwriting it
    const updateData = { ...data };
    delete updateData[pkCol];

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ ok: false, error: "No fields to update (PK-only payload)" });
      return;
    }

    await provider.updateRecord(table, id, updateData);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/crud/:connId/:table/:id
// Body (optional): { confirmed: true } — required for safety
// ---------------------------------------------------------------------------
router.delete("/:connId/:table/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { connId, table, id } = req.params;
    const body = req.body as Record<string, unknown> | undefined;

    if (!body?.confirmed) {
      res.status(400).json({
        ok: false,
        error: "Delete requires { confirmed: true } in the request body",
      });
      return;
    }

    const { provider } = await getConnectedProvider(connId);
    await provider.deleteRecord(table, id);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/crud/:connId/:table  (without :id)
// Bulk delete is blocked — explicit confirmation required per the plan.
// ---------------------------------------------------------------------------
router.delete("/:connId/:table", (_req: Request, res: Response) => {
  res.status(400).json({
    ok: false,
    error: "Bulk delete requires explicit confirmation. Provide a specific record :id.",
  });
});

export default router;
