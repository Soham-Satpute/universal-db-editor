// Mirrors the backend's shared types (server/src/types/index.ts) so
// the client and server agree on shape without sharing a package.
// Sensitive config fields are omitted by the server before responses.

export type DbType = "sqlite" | "postgresql" | "mongodb";

export interface ConnectionConfig {
  type: DbType;
  filePath?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  uri?: string;
}

export interface Connection {
  id: string;
  name: string;
  type: DbType;
  config?: Partial<ConnectionConfig>;
  isFavorite: boolean;
  isConnected?: boolean;
  createdAt?: string;
  updatedAt?: string;
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

export interface ExplorerTree {
  tables: string[];
  views: string[];
  indexes: string[];
}

export interface IndexInfo {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}
