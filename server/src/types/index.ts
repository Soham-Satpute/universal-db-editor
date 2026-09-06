// Shared types used across providers, routes, and middleware.
// Keeping these in one place means every provider implementation
// (SQLite / PostgreSQL / MongoDB) speaks the exact same contract.

export type DbType = "sqlite" | "postgresql" | "mongodb";

/**
 * Config needed to open a connection. Different fields are relevant
 * depending on `type` — e.g. SQLite only needs `filePath`, Postgres
 * needs host/port/etc OR a connectionString, Mongo just needs a uri.
 */
export interface ConnectionConfig {
  type: DbType;
  // SQLite
  filePath?: string;
  // PostgreSQL
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  // MongoDB
  uri?: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  defaultValue?: unknown;
}

export interface SchemaInfo {
  table: string;
  columns: ColumnInfo[];
}

/**
 * Rich index description used by the index-management UI (create/drop).
 * The plain listIndexes() on DatabaseProvider only returns names — this
 * carries enough to render and safely operate on an index.
 */
export interface IndexInfo {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

export interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: { field: string; direction: "asc" | "desc" };
  filter?: Record<string, unknown>;
}

export interface PaginatedResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields?: string[];
}

/**
 * The contract every concrete provider (SQLite/Postgres/Mongo) must
 * fulfill. Routes only ever talk to this interface — never to a
 * concrete driver directly — so swapping/adding databases later
 * (e.g. MySQL) doesn't touch route code.
 */
export interface DatabaseProvider {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  listTables(): Promise<string[]>;
  getSchema(table: string): Promise<SchemaInfo>;
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  findRecords(table: string, options: QueryOptions): Promise<PaginatedResult>;
  insertRecord(table: string, data: Record<string, unknown>): Promise<void>;
  updateRecord(table: string, id: unknown, data: Record<string, unknown>): Promise<void>;
  deleteRecord(table: string, id: unknown): Promise<void>;
}
