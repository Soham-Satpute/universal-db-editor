import {
  ConnectionConfig,
  DatabaseProvider,
  PaginatedResult,
  QueryOptions,
  QueryResult,
  SchemaInfo,
} from "../types";

/**
 * Abstract base class implementing the DatabaseProvider contract.
 * Concrete providers (SQLite/PostgreSQL/MongoDB) extend this and
 * fill in the actual driver logic. Keeping it as an abstract class
 * (rather than just the interface) lets us add shared helper
 * methods later (e.g. pagination math) without touching subclasses.
 */
export abstract class BaseProvider implements DatabaseProvider {
  /** Set true once connect() succeeds; guards calls made before connecting. */
  protected connected = false;

  abstract connect(config: ConnectionConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listTables(): Promise<string[]>;
  abstract getSchema(table: string): Promise<SchemaInfo>;
  abstract query(sql: string, params?: unknown[]): Promise<QueryResult>;
  abstract findRecords(table: string, options: QueryOptions): Promise<PaginatedResult>;
  abstract insertRecord(table: string, data: Record<string, unknown>): Promise<void>;
  abstract updateRecord(table: string, id: unknown, data: Record<string, unknown>): Promise<void>;
  abstract deleteRecord(table: string, id: unknown): Promise<void>;

  /** Throws if a method requiring an open connection is called too early. */
  protected assertConnected(): void {
    if (!this.connected) {
      throw new Error("Provider is not connected. Call connect() first.");
    }
  }
}
