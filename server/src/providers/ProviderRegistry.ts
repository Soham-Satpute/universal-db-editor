import { DatabaseProvider, DbType } from "../types";
import { SQLiteProvider } from "./SQLiteProvider";
import { PostgreSQLProvider } from "./PostgreSQLProvider";
import { MongoProvider } from "./MongoProvider";

/**
 * Maps a db type string -> provider class. Adding a new database
 * (e.g. "mysql") later means: write MySQLProvider.ts, add one line
 * here. No route code changes. This is the whole point of the
 * provider pattern (see ARCHITECTURE.md, written Day 7).
 */
const registry: Record<DbType, new () => DatabaseProvider> = {
  sqlite: SQLiteProvider,
  postgresql: PostgreSQLProvider,
  mongodb: MongoProvider,
};

export function getProvider(type: DbType): DatabaseProvider {
  const ProviderClass = registry[type];
  if (!ProviderClass) {
    throw new Error(`Unknown database type: "${type}"`);
  }
  return new ProviderClass();
}

/**
 * Active, already-connected provider instances, keyed by connection
 * id. Kept here (not per-request) so we don't reopen a DB connection
 * on every API call. Populated/consumed starting Day 2-3 once the
 * connection routes exist.
 */
export const activeProviders = new Map<string, DatabaseProvider>();
