import { Pool } from "pg";
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

export class PostgreSQLProvider extends BaseProvider {
  private pool?: Pool;

  async connect(config: ConnectionConfig): Promise<void> {
    this.pool = new Pool(
      config.connectionString
        ? { connectionString: config.connectionString }
        : {
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
          },
    );
    await this.pool.query("SELECT 1");
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.pool?.end();
    this.pool = undefined;
    this.connected = false;
  }

  async listTables(): Promise<string[]> {
    this.assertConnected();
    const { rows } = await this.pool!.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    return rows.map((row) => row.tablename);
  }

  async listViews(): Promise<string[]> {
    this.assertConnected();
    const { rows } = await this.pool!.query<{ viewname: string }>(
      "SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname",
    );
    return rows.map((row) => row.viewname);
  }

  async listIndexes(): Promise<string[]> {
    this.assertConnected();
    const { rows } = await this.pool!.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname",
    );
    return rows.map((row) => row.indexname);
  }

  /**
   * Richer index listing (table + columns + unique flag) used by the
   * index-management UI. pg_indexes' `indexdef` already has the full
   * CREATE INDEX statement — parse the column list and UNIQUE keyword
   * out of it rather than joining pg_index/pg_attribute.
   */
  async listIndexDetails(): Promise<IndexInfo[]> {
    this.assertConnected();
    const { rows } = await this.pool!.query<{
      indexname: string;
      tablename: string;
      indexdef: string;
    }>(
      "SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname",
    );

    return rows.map((row) => {
      const unique = /CREATE UNIQUE INDEX/i.test(row.indexdef);
      const colMatch = row.indexdef.match(/\(([^)]+)\)/);
      const columns = colMatch
        ? colMatch[1].split(",").map((c) => c.trim().replace(/"/g, ""))
        : [];
      return { name: row.indexname, table: row.tablename, columns, unique };
    });
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

    await this.pool!.query(
      `CREATE ${uniqueSql}INDEX ${quoteIdentifier(indexName)} ON ${quoteIdentifier(table)} (${colList})`,
    );
    return indexName;
  }

  async dropIndex(name: string): Promise<void> {
    this.assertConnected();
    await this.pool!.query(`DROP INDEX ${quoteIdentifier(name)}`);
  }

  async getSchema(table: string): Promise<SchemaInfo> {
    this.assertConnected();
    const { rows } = await this.pool!.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: unknown;
      is_primary_key: boolean;
    }>(
      `
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = c.table_schema
              AND tc.table_name = c.table_name
              AND kcu.column_name = c.column_name
          ) AS is_primary_key
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = $1
        ORDER BY c.ordinal_position
      `,
      [table],
    );

    return {
      table,
      columns: rows.map((row) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === "YES",
        isPrimaryKey: row.is_primary_key,
        defaultValue: row.column_default,
      })),
    };
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    this.assertConnected();
    const result = await this.pool!.query(sql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      fields: result.fields.map((field) => field.name),
    };
  }

  async findRecords(table: string, options: QueryOptions): Promise<PaginatedResult> {
    this.assertConnected();
    const { page, limit, offset } = normalizePagination(options);
    const values: unknown[] = [];
    const whereParts = Object.entries(options.filter ?? {}).map(([field, value], index) => {
      values.push(value);
      return `${quoteIdentifier(field)} = $${index + 1}`;
    });
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const orderClause = options.sort
      ? `ORDER BY ${quoteIdentifier(options.sort.field)} ${options.sort.direction.toUpperCase()}`
      : "";
    const limitParam = values.length + 1;
    const offsetParam = values.length + 2;

    const rowsResult = await this.pool!.query<Record<string, unknown>>(
      `SELECT * FROM ${quoteIdentifier(table)} ${whereClause} ${orderClause} LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...values, limit, offset],
    );
    const countResult = await this.pool!.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)} ${whereClause}`,
      values,
    );

    return { rows: rowsResult.rows, total: Number(countResult.rows[0]?.total ?? 0), page, limit };
  }

  async insertRecord(table: string, data: Record<string, unknown>): Promise<void> {
    this.assertConnected();
    const fields = Object.keys(data);
    const params = fields.map((_, index) => `$${index + 1}`).join(", ");
    await this.pool!.query(
      `INSERT INTO ${quoteIdentifier(table)} (${fields.map(quoteIdentifier).join(", ")}) VALUES (${params})`,
      fields.map((field) => data[field]),
    );
  }

  async updateRecord(table: string, id: unknown, data: Record<string, unknown>): Promise<void> {
    this.assertConnected();
    const fields = Object.keys(data);
    const assignments = fields
      .map((field, index) => `${quoteIdentifier(field)} = $${index + 1}`)
      .join(", ");
    await this.pool!.query(
      `UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE id = $${fields.length + 1}`,
      [...fields.map((field) => data[field]), id],
    );
  }

  async deleteRecord(table: string, id: unknown): Promise<void> {
    this.assertConnected();
    await this.pool!.query(`DELETE FROM ${quoteIdentifier(table)} WHERE id = $1`, [id]);
  }
}
