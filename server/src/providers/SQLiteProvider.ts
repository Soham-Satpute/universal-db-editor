import Database from "better-sqlite3";
import { BaseProvider } from "./BaseProvider";
import {
  ConnectionConfig,
  IndexInfo,
  PaginatedResult,
  QueryOptions,
  QueryResult,
  SchemaInfo,
} from "../types";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizePagination(options: QueryOptions): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(options.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 50)));
  return { page, limit, offset: (page - 1) * limit };
}

export class SQLiteProvider extends BaseProvider {
  private db?: Database.Database;

  async connect(config: ConnectionConfig): Promise<void> {
    if (!config.filePath) {
      throw new Error("SQLite connection requires filePath");
    }
    this.db = new Database(config.filePath, { fileMustExist: true });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.db?.close();
    this.db = undefined;
    this.connected = false;
  }

  async listTables(): Promise<string[]> {
    this.assertConnected();
    const rows = this.db!
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  async listViews(): Promise<string[]> {
    this.assertConnected();
    const rows = this.db!
      .prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name")
      .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  async listIndexes(): Promise<string[]> {
    this.assertConnected();
    const rows = this.db!
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  /**
   * Richer index listing (table + columns + unique flag) used by the
   * index-management UI. sqlite_master gives us name+table directly;
   * PRAGMA index_info/index_list fill in columns and uniqueness.
   */
  async listIndexDetails(): Promise<IndexInfo[]> {
    this.assertConnected();
    const idxRows = this.db!
      .prepare(
        "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string; tbl_name: string }>;

    const result: IndexInfo[] = [];
    for (const { name, tbl_name: table } of idxRows) {
      const columnRows = this.db!
        .prepare(`PRAGMA index_info(${quoteIdentifier(name)})`)
        .all() as Array<{ name: string }>;
      const listRows = this.db!
        .prepare(`PRAGMA index_list(${quoteIdentifier(table)})`)
        .all() as Array<{ name: string; unique: number }>;
      const unique = listRows.find((row) => row.name === name)?.unique === 1;

      result.push({ name, table, columns: columnRows.map((c) => c.name), unique });
    }
    return result;
  }

  async createIndex(
    table: string,
    columns: string[],
    options?: { unique?: boolean; name?: string },
  ): Promise<string> {
    this.assertConnected();
    if (columns.length === 0) throw new Error("At least one column is required");

    const indexName = options?.name?.trim() || `idx_${table}_${columns.join("_")}`;
    const uniqueSql = options?.unique ? "UNIQUE " : "";
    const colList = columns.map(quoteIdentifier).join(", ");

    this.db!.exec(
      `CREATE ${uniqueSql}INDEX ${quoteIdentifier(indexName)} ON ${quoteIdentifier(table)} (${colList})`,
    );
    return indexName;
  }

  async dropIndex(name: string): Promise<void> {
    this.assertConnected();
    this.db!.exec(`DROP INDEX ${quoteIdentifier(name)}`);
  }

  async getSchema(table: string): Promise<SchemaInfo> {
    this.assertConnected();
    const rows = this.db!.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
      dflt_value: unknown;
    }>;

    return {
      table,
      columns: rows.map((row) => ({
        name: row.name,
        type: row.type || "unknown",
        nullable: row.notnull === 0,
        isPrimaryKey: row.pk > 0,
        defaultValue: row.dflt_value,
      })),
    };
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    this.assertConnected();
    const statement = this.db!.prepare(sql);

    if (statement.reader) {
      const rows = statement.all(params) as Record<string, unknown>[];
      return { rows, rowCount: rows.length, fields: rows.length ? Object.keys(rows[0]) : [] };
    }

    const result = statement.run(params);
    return { rows: [], rowCount: result.changes };
  }

  async findRecords(table: string, options: QueryOptions): Promise<PaginatedResult> {
    this.assertConnected();
    const { page, limit, offset } = normalizePagination(options);
    const tableName = quoteIdentifier(table);
    const values: unknown[] = [];
    const whereParts = Object.entries(options.filter ?? {}).map(([field, value]) => {
      values.push(value);
      return `${quoteIdentifier(field)} = ?`;
    });
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const orderClause = options.sort
      ? `ORDER BY ${quoteIdentifier(options.sort.field)} ${options.sort.direction.toUpperCase()}`
      : "";

    const rows = this.db!
      .prepare(`SELECT * FROM ${tableName} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`)
      .all([...values, limit, offset]) as Record<string, unknown>[];
    const totalRow = this.db!
      .prepare(`SELECT COUNT(*) AS total FROM ${tableName} ${whereClause}`)
      .get(values) as { total: number };

    return { rows, total: totalRow.total, page, limit };
  }

  async insertRecord(table: string, data: Record<string, unknown>): Promise<void> {
    this.assertConnected();
    const fields = Object.keys(data);
    const placeholders = fields.map(() => "?").join(", ");
    this.db!
      .prepare(
        `INSERT INTO ${quoteIdentifier(table)} (${fields.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`,
      )
      .run(fields.map((field) => data[field]));
  }

  async updateRecord(table: string, id: unknown, data: Record<string, unknown>): Promise<void> {
    this.assertConnected();
    const fields = Object.keys(data);
    const assignments = fields.map((field) => `${quoteIdentifier(field)} = ?`).join(", ");
    this.db!
      .prepare(`UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE id = ?`)
      .run([...fields.map((field) => data[field]), id]);
  }

  async deleteRecord(table: string, id: unknown): Promise<void> {
    this.assertConnected();
    this.db!.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE id = ?`).run(id);
  }
}
