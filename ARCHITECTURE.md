# Architecture

## Overview

The server is a thin Express layer on top of a **provider pattern**:
every database operation — list tables, run a query, insert a row —
goes through one shared interface, `DatabaseProvider`, instead of
routes talking to `pg`, `better-sqlite3`, or `mongodb` directly.

```
Route handler  →  DatabaseProvider interface  →  concrete provider  →  driver
(connections.ts)    (BaseProvider.ts)              (SQLiteProvider.ts)   (better-sqlite3)
                                                    (PostgreSQLProvider.ts) (pg)
                                                    (MongoProvider.ts)      (mongodb)
```

Routes never import `pg`, `better-sqlite3`, or `mongodb` (`query.ts`
is the one deliberate exception — see "Raw Mongo client" below). They
only ever call methods on whatever `DatabaseProvider` they're handed.

## The `DatabaseProvider` contract

Defined in `src/types/index.ts`:

```ts
interface DatabaseProvider {
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
```

`BaseProvider` (`src/providers/BaseProvider.ts`) is an abstract class
that implements this interface with all methods left `abstract`,
plus one shared helper: `assertConnected()`, which every concrete
provider calls at the top of its methods to fail fast with a clear
error if someone calls e.g. `listTables()` before `connect()`.

Three concrete providers extend it:

| Provider | Driver | Notes |
|---|---|---|
| `SQLiteProvider` | `better-sqlite3` | Synchronous driver wrapped in `async` methods for interface compatibility. `connect()` uses `fileMustExist: true` — it opens an existing file, never creates one. |
| `PostgreSQLProvider` | `pg` (`Pool`, not `Client`) | A `Pool` is used so the driver handles reconnects automatically; `connect()` runs `SELECT 1` to fail fast on bad credentials. |
| `MongoProvider` | `mongodb` | `getSchema()` has no real schema to read, so it samples 5 documents from the collection and infers field names/types from them. |

Each provider also implements a few extras beyond the shared
interface where it's relevant — e.g. `listViews()` / `listIndexes()`
on the SQL providers, used by the explorer routes via an optional
`ProviderWithExtras` type (`src/routes/explorer.ts`). Optional means
exactly that: `explorer.ts` calls `provider.listViews?.()` and falls
back to `[]` for Mongo, which has no concept of views.

The same optional-extension pattern powers index management
(`src/routes/indexes.ts`'s `IndexCapableProvider` type):
`listIndexDetails()`, `createIndex(table, columns, options)`, and
`dropIndex(name, table?)` are all implemented on `SQLiteProvider` and
`PostgreSQLProvider` (parsing `sqlite_master`/`pg_indexes` output and
generating quoted `CREATE`/`DROP INDEX` statements respectively) and
on `MongoProvider` (thin wrappers over `collection.createIndex()` /
`dropIndex()`, iterated across every collection for the list/detail
call since Mongo has no single global index catalog). The route
checks each method with `provider.createIndex?.(...)` and returns
`{ ok: false, error: "This provider doesn't support ..." }` for any
provider that doesn't implement it, rather than assuming all three
always will.

## The registry

`src/providers/ProviderRegistry.ts` maps a `DbType` string (`"sqlite"
| "postgresql" | "mongodb"`) to a provider class, and exposes one
function:

```ts
export function getProvider(type: DbType): DatabaseProvider {
  const ProviderClass = registry[type];
  if (!ProviderClass) throw new Error(`Unknown database type: "${type}"`);
  return new ProviderClass();
}
```

Routes never instantiate `new SQLiteProvider()` directly — they call
`getProvider(storedConnection.type)`. This is the one and only place
that needs to change to add a new database (see below).

The registry module also exports `activeProviders`, a
`Map<connectionId, DatabaseProvider>` of already-connected provider
instances. Routes check this map before opening a new connection, so
a given saved connection only opens **one** underlying driver
connection/pool, reused across requests — not a fresh `pg.Pool` or
SQLite file handle per HTTP request.

## Request flow example: `GET /api/crud/:connId/:table`

1. `crud.ts` calls a local `getConnectedProvider(connId)` helper.
2. That helper checks `activeProviders` for an existing instance. If
   none exists, it loads the connection's encrypted config from
   `connections.json` (`connectionStore.ts`), decrypts it
   (`utils/encryption.ts`), calls `getProvider(type)`, connects, and
   caches the result in `activeProviders`.
3. The route calls `provider.getSchema(table)` to learn the column
   types (used to decide which columns are searchable text), then
   `provider.findRecords(table, options)` for the actual paginated
   data.
4. The response is `{ ok, rows, total, page, limit }` — the same
   shape regardless of which of the three databases is behind it.

This same `getConnectedProvider` helper (duplicated per route file
rather than shared — see "Known simplification" below) is what
`explorer.ts`, `query.ts`, `export.ts`, and `import.ts` all use too.

## Raw Mongo client in `query.ts`

`MongoProvider` doesn't expose its underlying `Db` instance, so the
query playground's free-form `db.collection.find({...})` parser
(`query.ts`) opens its own short-lived `MongoClient` rather than
going through the provider interface. This is a deliberate, narrow
exception: the query playground needs arbitrary `find` /
`aggregate` / `countDocuments` calls that don't map onto the fixed
`DatabaseProvider` contract. SQLite and PostgreSQL queries in the
same route go through `provider.query(sql)` normally.

## AI assistant (`ai.ts`)

The Query Playground's autocomplete/explain/fix buttons are the one
route file that talks to an external HTTP API instead of a database
driver. `ai.ts` follows the same `getConnectedProvider()` pattern as
every other route to reach the target database, then:

1. Calls `buildSchemaContext(provider, focusTable)` — lists every
   table via `provider.listTables()`, then pulls full column detail
   (via `provider.getSchema()`) for the focused table plus up to 4
   more, capping the prompt size regardless of how wide the database
   is.
2. Passes that context plus the query text to `callGroq()`, a plain
   `fetch()` against Groq's OpenAI-compatible `/chat/completions`
   endpoint (no SDK dependency) with `response_format: json_object`
   so the response is parsed with `JSON.parse` rather than scraped
   out of prose.
3. Returns the parsed field the frontend expects (`suggestion` /
   `explanation` / `fixedQuery` + `explanation`), falling back to an
   empty value via `safeJsonParse()` if Groq's output isn't valid
   JSON for some reason, rather than 500ing on a parse error.

This is intentionally provider-agnostic in the same sense the rest of
the app is: `buildSchemaContext()` calls only `DatabaseProvider`
interface methods, so autocomplete/explain/fix work unmodified
against SQLite, PostgreSQL, or MongoDB — the only per-database
difference is the `dialectLabel()` string injected into the system
prompt so the model knows which SQL dialect (or Mongo shell syntax)
to speak.

Swapping Groq for a different provider (including Anthropic's API)
only touches `callGroq()` — the schema-context builder and the three
route handlers around it are provider-agnostic.

## Security layers

- **Credential encryption** (`utils/encryption.ts`) — AES-256-GCM,
  key from `ENCRYPTION_KEY` in `.env`. Connection configs are
  encrypted before being written to `data/connections.json` and
  decrypted only in memory, just before `provider.connect()`.
  `sanitize()` in `connections.ts` strips passwords/URIs before any
  connection object is sent back to the client.
- **`queryGuard` middleware** (`middleware/queryGuard.ts`) — runs
  before `POST /api/query/:connId`, regex-matches the incoming query
  text against a blocklist (`DROP`, `TRUNCATE`, unconditioned
  `DELETE`, `ALTER TABLE ... DROP COLUMN`), and returns
  `403 { requiresConfirmation: true }` instead of executing it. The
  frontend's confirmation modal re-submits the same request with
  `{ confirmed: true }`, which the guard explicitly allows through.
- **`zod` validation** — every `POST`/`PUT` body for connections is
  validated against a discriminated union schema (one branch per
  `DbType`) before it's ever encrypted or passed to a provider.
- **`helmet`** — standard security headers on every response.
- **Pagination everywhere** — `findRecords()` on every provider caps
  `limit` at 100 and always applies `LIMIT`/`OFFSET` (or
  `.skip().limit()` for Mongo). There is no code path that returns
  an entire table unbounded.

## Adding a new database (worked example: MySQL)

This is the scenario the provider pattern is built for. To add
MySQL support:

1. **Install a driver:** `npm install mysql2`.
2. **Create `src/providers/MySQLProvider.ts`** extending `BaseProvider`,
   implementing all nine interface methods using `mysql2/promise`. Use
   `PostgreSQLProvider.ts` as the closest template — same pagination
   math, same `quoteIdentifier()` pattern, same parameterized-query
   discipline.
3. **Add a line to the registry:**
   ```ts
   // src/providers/ProviderRegistry.ts
   const registry: Record<DbType, new () => DatabaseProvider> = {
     sqlite: SQLiteProvider,
     postgresql: PostgreSQLProvider,
     mongodb: MongoProvider,
     mysql: MySQLProvider, // ← new
   };
   ```
4. **Extend the `DbType` union and `ConnectionConfig`** in
   `src/types/index.ts` (`"mysql"` joins the union; add whatever
   config fields MySQL needs — likely none beyond what Postgres
   already has).
5. **Add a zod schema branch** in `connections.ts`
   (`MySQLConnectionSchema`, added to the `ConnectionSchema`
   discriminated union).
6. **That's it for the backend's core CRUD/query path.** No route
   file changes — `crud.ts`, `explorer.ts`, `query.ts`, `export.ts`,
   and `import.ts` all only ever call methods on the
   `DatabaseProvider` interface, so they work against MySQL
   automatically once steps 1–5 are done. `indexes.ts` and `ai.ts`
   work too, just without index management or schema-detail-based AI
   context until you also add the optional extras below.
7. **Optional — index management:** implement
   `listIndexDetails()` / `createIndex()` / `dropIndex()` on
   `MySQLProvider` (same `IndexCapableProvider` shape
   `PostgreSQLProvider` uses) to light up `indexes.ts` and the
   schema tree's Indexes UI for MySQL. Skip this and `indexes.ts`
   degrades gracefully — it returns `{ indexes: [], supported: false }`
   rather than erroring.
8. On the frontend, add `"mysql"` to the connection type selector and
   a matching form in `ConnectionForm.tsx` — the rest of the UI
   (data grid, query playground, schema viewer) is already
   database-agnostic.

## Known simplification

`getConnectedProvider()` is implemented separately (with near-identical
bodies) in `crud.ts`, `explorer.ts`, `query.ts`, `export.ts`,
`import.ts`, `indexes.ts`, and `ai.ts` — seven copies now, not five —
instead of being pulled into one shared module. This was a deliberate
Day-3-era shortcut to keep each route file readable in isolation
while the project was still taking shape; a natural follow-up would
be to extract it into a single `utils/getConnectedProvider.ts` shared
by all seven route files. It hasn't caused a bug yet since all seven
copies stayed in sync by hand, but that's luck, not a guarantee.

## Data persistence

There's no database for the app's own metadata — everything is flat
JSON files in `server/data/`:

- `connections.json` — saved connections (`StoredConnection[]`),
  credentials AES-256-GCM encrypted.
- `query-history.json` — last 50 queries per connection
  (`utils/queryHistory.ts`).

This is intentional for a tool whose entire job is browsing *other*
databases — it avoids the chicken-and-egg problem of needing a
database to run a database browser, and it's trivial to back up
(copy the `data/` folder) or wipe (delete it; both files are
regenerated empty on first read).
