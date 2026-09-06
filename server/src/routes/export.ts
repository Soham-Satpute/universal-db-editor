import { Router, Request, Response } from "express";
import { decrypt } from "../utils/encryption";
import { findById } from "../utils/connectionStore";
import { activeProviders, getProvider } from "../providers/ProviderRegistry";
import { ConnectionConfig, DatabaseProvider, SchemaInfo } from "../types";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: get (or lazily connect) a provider
// ---------------------------------------------------------------------------
async function getConnectedProvider(connId: string): Promise<{
  provider: DatabaseProvider;
  type: string;
  name: string;
}> {
  const existing = activeProviders.get(connId);
  const stored = findById(connId);
  if (!stored) throw Object.assign(new Error("Connection not found"), { status: 404 });

  if (existing) return { provider: existing, type: stored.type, name: stored.name };

  let config: ConnectionConfig;
  try {
    config = JSON.parse(decrypt(stored.encryptedConfig)) as ConnectionConfig;
  } catch {
    throw Object.assign(new Error("Failed to decrypt connection config"), { status: 500 });
  }

  const provider = getProvider(stored.type);
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
  if (!res.headersSent) {
    res.status(Number.isFinite(status) ? status : 500).json({ ok: false, error: message });
  }
}

// ---------------------------------------------------------------------------
// Streaming helpers
// ---------------------------------------------------------------------------

/**
 * Escape a CSV cell value: wrap in quotes if it contains commas,
 * newlines, or double-quotes; double any embedded quotes.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function escSql(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Fetch ALL rows of a table in pages of 500, calling onBatch for each page.
 * Never loads the full table into memory at once.
 */
async function streamRows(
  provider: DatabaseProvider,
  table: string,
  onBatch: (rows: Record<string, unknown>[]) => void,
): Promise<void> {
  const PAGE = 500;
  let page = 1;
  while (true) {
    const result = await provider.findRecords(table, { page, limit: PAGE });
    if (result.rows.length === 0) break;
    onBatch(result.rows);
    if (result.rows.length < PAGE) break;
    page++;
  }
}

// ---------------------------------------------------------------------------
// GET /api/export/:connId/:table?format=csv|json|sql
// ---------------------------------------------------------------------------
router.get("/:connId/:table", async (req: Request, res: Response): Promise<void> => {
  const { connId, table } = req.params;
  const format = (req.query.format as string) || "csv";

  if (!["csv", "json", "sql"].includes(format)) {
    res.status(400).json({ ok: false, error: 'format must be csv, json, or sql' });
    return;
  }

  let provider: DatabaseProvider;
  try {
    ({ provider } = await getConnectedProvider(connId));
  } catch (err) {
    sendError(res, err);
    return;
  }

  // Get schema for column ordering and SQL DDL
  let schema: SchemaInfo | null = null;
  try {
    schema = await provider.getSchema(table);
  } catch { /* continue without schema */ }

  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "_");
  const filename = `${safeTable}_export.${format}`;

  // ---------- CSV ----------------------------------------------------------
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    let headerWritten = false;

    try {
      await streamRows(provider, table, (rows) => {
        if (!headerWritten) {
          const cols = schema?.columns.map((c) => c.name) ?? Object.keys(rows[0]);
          res.write(cols.map(csvCell).join(",") + "\n");
          headerWritten = true;
        }
        for (const row of rows) {
          const cols = schema?.columns.map((c) => c.name) ?? Object.keys(row);
          res.write(cols.map((col) => csvCell(row[col])).join(",") + "\n");
        }
      });
    } catch (err) {
      sendError(res, err);
      return;
    }

    res.end();
    return;
  }

  // ---------- JSON ---------------------------------------------------------
  if (format === "json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.write("[\n");
    let first = true;

    try {
      await streamRows(provider, table, (rows) => {
        for (const row of rows) {
          if (!first) res.write(",\n");
          res.write(JSON.stringify(row));
          first = false;
        }
      });
    } catch (err) {
      sendError(res, err);
      return;
    }

    res.write("\n]\n");
    res.end();
    return;
  }

  // ---------- SQL ----------------------------------------------------------
  if (format === "sql") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.write(`-- Export of ${table}\n-- Generated: ${new Date().toISOString()}\n\n`);

    try {
      await streamRows(provider, table, (rows) => {
        for (const row of rows) {
          const cols = schema?.columns.map((c) => c.name) ?? Object.keys(row);
          const colList = cols.map(quoteIdent).join(", ");
          const valList = cols.map((col) => escSql(row[col])).join(", ");
          res.write(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${valList});\n`);
        }
      });
    } catch (err) {
      sendError(res, err);
      return;
    }

    res.end();
    return;
  }
});

// ---------------------------------------------------------------------------
// GET /api/export/:connId?format=json|sql
// Full-database dump: every table/collection in one file. CSV isn't
// offered here (a single flat file can't hold multiple tables sensibly);
// use the per-table endpoint above for CSV.
// ---------------------------------------------------------------------------
router.get("/:connId", async (req: Request, res: Response): Promise<void> => {
  const { connId } = req.params;
  const format = (req.query.format as string) || "sql";

  if (!["json", "sql"].includes(format)) {
    res.status(400).json({ ok: false, error: "format must be json or sql" });
    return;
  }

  let provider: DatabaseProvider;
  let connName: string;
  try {
    const resolved = await getConnectedProvider(connId);
    provider = resolved.provider;
    connName = resolved.name;
  } catch (err) {
    sendError(res, err);
    return;
  }

  let tables: string[];
  try {
    tables = await provider.listTables();
  } catch (err) {
    sendError(res, err);
    return;
  }

  const safeName = connName.replace(/[^a-zA-Z0-9_-]/g, "_") || "database";
  const filename = `${safeName}_full_export.${format}`;

  // ---------- SQL (whole database) -----------------------------------------
  if (format === "sql") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.write(
      `-- Full database export: ${connName}\n` +
        `-- Tables: ${tables.length}\n` +
        `-- Generated: ${new Date().toISOString()}\n\n`,
    );

    try {
      for (const table of tables) {
        res.write(
          `-- ---------------------------------------------------------\n` +
            `-- Table: ${table}\n` +
            `-- ---------------------------------------------------------\n`,
        );
        let wroteAnyRow = false;
        await streamRows(provider, table, (rows) => {
          for (const row of rows) {
            wroteAnyRow = true;
            const cols = Object.keys(row);
            const colList = cols.map(quoteIdent).join(", ");
            const valList = cols.map((col) => escSql(row[col])).join(", ");
            res.write(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${valList});\n`);
          }
        });
        if (!wroteAnyRow) res.write("-- (no rows)\n");
        res.write("\n");
      }
    } catch (err) {
      sendError(res, err);
      return;
    }

    res.end();
    return;
  }

  // ---------- JSON (whole database) -----------------------------------------
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  res.write("{\n");
  let firstTable = true;

  try {
    for (const table of tables) {
      if (!firstTable) res.write(",\n");
      firstTable = false;
      res.write(`${JSON.stringify(table)}: [\n`);

      let firstRow = true;
      await streamRows(provider, table, (rows) => {
        for (const row of rows) {
          if (!firstRow) res.write(",\n");
          res.write(JSON.stringify(row));
          firstRow = false;
        }
      });

      res.write("\n]");
    }
  } catch (err) {
    sendError(res, err);
    return;
  }

  res.write("\n}\n");
  res.end();
});

export default router;
