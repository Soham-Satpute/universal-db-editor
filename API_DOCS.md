# API Documentation

Base URL (local dev): `http://localhost:3001/api`

All responses are JSON unless noted (export endpoints stream
CSV/JSON/SQL as a file download). Every JSON response includes an
`ok: boolean` field. On failure, the shape is:

```json
{ "ok": false, "error": "human-readable message" }
```

---

## Health

### `GET /api/health`

Liveness check, no auth.

**Response `200`**
```json
{ "ok": true, "service": "universal-db-editor-server" }
```

---

## Connections

A "connection" is a saved set of credentials for one SQLite file,
PostgreSQL server, or MongoDB instance. Credentials are AES-256-GCM
encrypted at rest and **never** returned to the client — every
response below strips passwords/URIs.

### `GET /api/connections`

List all saved connections, favorites first, then alphabetical.

**Response `200`**
```json
{
  "ok": true,
  "connections": [
    {
      "id": "uuid",
      "name": "Prod Postgres",
      "type": "postgresql",
      "isFavorite": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "config": { "type": "postgresql", "host": "...", "port": 5432, "database": "...", "user": "..." }
    }
  ]
}
```
Note: `config.password` (Postgres) and `config.uri` (MongoDB) are
always omitted. SQLite's `config.filePath` is not a secret and is
included.

### `POST /api/connections`

Create a connection. Accepts either `application/json` or
`multipart/form-data` (the latter required for SQLite file uploads —
field name `file`).

**Body (JSON, discriminated by `type`)**

SQLite:
```json
{ "name": "My SQLite DB", "type": "sqlite", "filePath": "/path/on/server.sqlite" }
```
or upload a `.sqlite` / `.sqlite3` / `.db` file as multipart field `file`
(stored under `server/uploads/`, max 100 MB).

PostgreSQL:
```json
{
  "name": "My Postgres",
  "type": "postgresql",
  "host": "localhost", "port": 5432, "database": "mydb",
  "user": "admin", "password": "secret"
}
```
or supply `connectionString` instead of the individual fields.

MongoDB:
```json
{ "name": "My Mongo", "type": "mongodb", "uri": "mongodb://localhost:27017/mydb" }
```

All three accept an optional `"isFavorite": boolean` (default `false`).

**Responses**
- `201` — `{ ok: true, connection: { ...sanitized } }`
- `400` — validation failure (zod errors in `error`, e.g. missing
  `uri` for MongoDB, missing `filePath`/file for SQLite)

### `PUT /api/connections/:id`

Edit an existing connection. Same body shape as `POST`. If
`password` (Postgres) or `uri` (MongoDB) is omitted, the previously
stored value is kept rather than cleared. Disconnects and removes any
cached active provider for this id so the next request reconnects
with the new config.

**Responses**
- `200` — `{ ok: true, connection: { ...sanitized } }`
- `400` — validation failure
- `404` — no connection with that id

### `DELETE /api/connections/:id`

Remove a connection from the store and disconnect its active
provider, if any.

**Responses**
- `200` — `{ ok: true }`
- `404` — no connection with that id

### `POST /api/connections/:id/test`

Decrypt the stored config, call `provider.connect()` then
`provider.disconnect()`, and report whether it succeeded — without
caching anything in `activeProviders`.

**Responses**
- `200` — `{ ok: true }` on success, or `{ ok: false, error: "..." }` on a failed connection attempt (note: still HTTP 200 — the *test* succeeded in reporting the result, the *connection* is what failed)
- `404` — no connection with that id

### `PATCH /api/connections/:id/favorite`

Toggle `isFavorite`.

**Response `200`**
```json
{ "ok": true, "isFavorite": true }
```
`404` if the id doesn't exist.

---

## Explorer

### `GET /api/explorer/:connId/tables`

Lazily connects (and caches) the provider for `connId`, then lists
tables/collections (and views/indexes for SQL databases).

**Response `200`**
```json
{
  "ok": true,
  "connection": { "id": "uuid", "name": "My Postgres", "type": "postgresql" },
  "tables": ["users", "orders"],
  "views": ["active_users"],
  "indexes": ["users_email_idx"]
}
```
`views` and `indexes` are always `[]` for MongoDB.

### `GET /api/explorer/:connId/schema/:table`

**Response `200`**
```json
{
  "ok": true,
  "schema": {
    "table": "users",
    "columns": [
      { "name": "id", "type": "INTEGER", "nullable": false, "isPrimaryKey": true, "defaultValue": null },
      { "name": "email", "type": "TEXT", "nullable": true, "isPrimaryKey": false, "defaultValue": null }
    ]
  }
}
```
For MongoDB, columns are inferred by sampling 5 documents from the
collection.

### `GET /api/explorer/:connId/relationships`

Foreign-key relationships for SQL databases.

**Response `200`**
```json
{
  "ok": true,
  "relationships": [
    { "fromTable": "orders", "fromColumn": "user_id", "toTable": "users", "toColumn": "id", "constraintName": "orders_user_id_fkey" }
  ]
}
```
Always `[]` for MongoDB (no FK concept).

Shared error for all explorer routes: `404` if `connId` doesn't
exist, `500` if the connection's encrypted config fails to decrypt.

---

## CRUD

### `GET /api/crud/:connId/:table`

**Query params:** `page` (default 1), `limit` (default 50, capped at
100), `sort` (column name), `order` (`asc` | `desc`, default `asc`),
`search` (case-insensitive match across all text/string columns,
debounced client-side).

**Response `200`**
```json
{ "ok": true, "rows": [ { "id": 1, "name": "Ada" } ], "total": 42, "page": 1, "limit": 50 }
```

### `POST /api/crud/:connId/:table`

**Body:** JSON object of fields to insert.

**Responses**
- `201` — `{ ok: true }`
- `400` — empty body or non-object body

### `PUT /api/crud/:connId/:table/:id`

**Body:** JSON object of fields to update (partial allowed). The
primary key column (auto-detected from the table's schema, falling
back to `id` for SQL / `_id` for Mongo) is silently stripped from
the payload if present, to avoid accidentally rewriting it.

**Responses**
- `200` — `{ ok: true }`
- `400` — empty body, or body contained only the PK column

### `DELETE /api/crud/:connId/:table/:id`

**Body (required):**
```json
{ "confirmed": true }
```

**Responses**
- `200` — `{ ok: true }`
- `400` — `{ confirmed: true }` missing from the body

### `DELETE /api/crud/:connId/:table` (no `:id`)

Always blocked — bulk delete is not supported via this endpoint.

**Response `400`**
```json
{ "ok": false, "error": "Bulk delete requires explicit confirmation. Provide a specific record :id." }
```

Shared error for all CRUD routes: `404` if `connId` doesn't exist.

---

## Query Playground

### `POST /api/query/:connId`

Runs through the `queryGuard` middleware first (see below).

**Body:**
```json
{ "query": "SELECT * FROM users LIMIT 10" }
```
For MongoDB, `query` is shell-style syntax:
`db.users.find({"age":{"$gt":21}})`, `db.users.findOne({...})`,
`db.users.countDocuments({...})`, or `db.users.aggregate([...])`.

**Response `200`**
```json
{ "ok": true, "columns": ["id", "name"], "rows": [...], "rowCount": 10, "executionTimeMs": 4 }
```

**Response `403`** (blocked by `queryGuard`)
```json
{ "ok": false, "error": "DROP statements are not allowed", "requiresConfirmation": true }
```
Re-submit the identical request with `{ "query": "...", "confirmed": true }` to force it through.

**Response `400`** — empty `query`, or for Mongo, syntax that doesn't match the supported `db.collection.method(...)` shape.

Every executed query (success or failure) is appended to that
connection's history.

### `GET /api/query/:connId/history`

**Response `200`**
```json
{
  "ok": true,
  "history": [
    { "id": "uuid", "query": "SELECT 1", "executedAt": "2026-01-01T00:00:00.000Z", "executionTimeMs": 2, "rowCount": 1 }
  ]
}
```
Capped at the most recent 50 entries per connection.

### `DELETE /api/query/:connId/history`

Clears history for that connection. `{ ok: true }`.

---

## Export

### `GET /api/export/:connId/:table?format=csv|json|sql`

Streams the full table in pages of 500 rows (never loads it all into
memory). `format` defaults to `csv` if omitted.

- `csv` → `Content-Type: text/csv`, header row from schema column order
- `json` → `Content-Type: application/json`, a JSON array
- `sql` → `Content-Type: text/plain`, one `INSERT INTO ... VALUES (...);` per row

All three set `Content-Disposition: attachment; filename="<table>_export.<format>"`.

**Response `400`** if `format` isn't one of the three above.
**Response `404`** if `connId` doesn't exist (only if it fails before any bytes are written — once streaming starts, errors can't change the HTTP status, since headers are already sent).

### `GET /api/export/:connId?format=json|sql`

Full-database dump: every table/collection in one file, still
streamed in pages of 500 rows per table. `format` defaults to `sql`
if omitted. CSV is **not** offered here — a single flat file can't
sensibly hold multiple tables — use the per-table endpoint above for
CSV.

- `sql` → `Content-Type: text/plain`, one commented header per
  table (`-- Table: users`) followed by its `INSERT INTO ...`
  statements; tables with no rows get a `-- (no rows)` marker instead
  of being silently skipped.
- `json` → `Content-Type: application/json`, an object keyed by
  table name, each value a JSON array of rows:
  ```json
  { "users": [ { "id": 1, "name": "Ada" } ], "orders": [ ... ] }
  ```

Both set `Content-Disposition: attachment; filename="<connection_name>_full_export.<format>"`.

**Response `400`** if `format` isn't `json` or `sql`.
**Response `404`** if `connId` doesn't exist (before streaming starts).

---

## Import

### `POST /api/import/:connId/:table`

**Body:** `multipart/form-data`, single file field named `file`
(`.csv` or `.json`, max 50 MB). CSV must have a header row; JSON must
be a top-level array of objects.

Each row is inserted individually via `provider.insertRecord()`; a
failure on one row doesn't stop the rest. Empty-string fields are
stripped before insert so they don't clobber nullable columns with
empty strings.

**Response `200`**
```json
{ "ok": true, "inserted": 248, "failed": 2, "errors": [{ "row": 17, "error": "NOT NULL constraint failed: users.email" }] }
```
`errors` is capped at the first 20 entries.

**Response `400`** — no file uploaded, file isn't valid CSV/JSON, or the file has zero data rows.

---

## Indexes

Index introspection/management is optional per provider — the same
pattern the explorer routes use for `listViews()`/`listIndexes()`.
SQLite and PostgreSQL support all three endpoints below. For MongoDB,
indexes are scoped to a specific collection rather than one global
namespace, so `table` is required where noted.

### `GET /api/indexes/:connId`

**Response `200`**
```json
{
  "ok": true,
  "supported": true,
  "indexes": [
    { "name": "users_email_idx", "table": "users", "columns": ["email"], "unique": true }
  ]
}
```
If the connected provider doesn't support index introspection,
returns `{ ok: true, indexes: [], supported: false }` instead of an
error.

### `POST /api/indexes/:connId`

**Body:**
```json
{ "table": "users", "columns": ["email"], "unique": true, "name": "users_email_idx" }
```
`unique` defaults to `false`; `name` is optional — the provider
generates one if omitted. Supports composite indexes (multiple
entries in `columns`).

**Responses**
- `200` — `{ ok: true, index: { name, table, columns, unique } }`
- `400` — `table` missing, `columns` empty, or the provider doesn't support creating indexes

### `DELETE /api/indexes/:connId/:name`

**Query params:** `table` — required for MongoDB (indexes are
collection-scoped there), optional/ignored for SQL databases.

**Responses**
- `200` — `{ ok: true }`
- `400` — the provider doesn't support dropping indexes

Shared error for all index routes: `404` if `connId` doesn't exist.

---

## AI Assistant

Groq-backed helpers for the Query Playground — autocomplete, plain-English
explanations, and error fixes. All three require `GROQ_API_KEY` to be
set on the server (see the environment variables table in
`README.md`); without it, every endpoint below returns `500` with a
message saying so.

Each endpoint builds a compact schema-context string (table list,
plus column detail for the focused table and up to 4 others) to
ground the model's response, and calls Groq's OpenAI-compatible
`/chat/completions` endpoint (default model `llama-3.3-70b-versatile`,
overridable via `GROQ_MODEL`) with `response_format: json_object`.

### `POST /api/ai/:connId/autocomplete`

**Body:**
```json
{ "query": "SELECT * FROM users WHERE ", "table": "users" }
```
`table` is optional — it just gets schema detail prioritized in the
prompt context.

**Response `200`**
```json
{ "ok": true, "suggestion": "created_at > '2026-01-01'" }
```
`suggestion` is empty-string if the model found nothing sensible to add.

### `POST /api/ai/:connId/explain`

**Body:**
```json
{ "query": "SELECT * FROM users LIMIT 10", "table": "users" }
```

**Response `200`**
```json
{ "ok": true, "explanation": "Reads the first 10 rows from users, all columns, no filtering." }
```

### `POST /api/ai/:connId/fix`

**Body:**
```json
{ "query": "SELCT * FROM users", "error": "syntax error at or near \"SELCT\"", "table": "users" }
```
`error` is optional but improves the fix quality — pass whatever
message the failed query returned.

**Response `200`**
```json
{ "ok": true, "fixedQuery": "SELECT * FROM users", "explanation": "Fixed the misspelled SELECT keyword." }
```

**Shared for all three AI routes**
- `400` — empty `query`
- `404` — `connId` doesn't exist
- `500` — `GROQ_API_KEY` not configured, Groq API unreachable, or Groq returned an error/empty response
- `502` — Groq API returned a non-2xx response or the request to Groq failed at the network level

---

## `queryGuard` blocked patterns

Applied to the `query` field of `POST /api/query/:connId` only
(connections/CRUD/import are not free-text SQL, so they're not
subject to this guard — CRUD delete has its own `{ confirmed: true }`
requirement instead):

| Pattern | Example blocked |
|---|---|
| `DROP DATABASE/TABLE/INDEX/SCHEMA` | `DROP TABLE users` |
| `TRUNCATE [TABLE]` | `TRUNCATE orders` |
| `DELETE FROM <table>` with no `WHERE` | `DELETE FROM users` |
| `ALTER TABLE ... DROP COLUMN` | `ALTER TABLE users DROP COLUMN email` |

Matching is case-insensitive. Any blocked request returns `403
{ error, requiresConfirmation: true }`; resending with `confirmed:
true` in the body bypasses the guard for that one request.

---

## Error status codes (summary)

| Status | Meaning |
|---|---|
| `400` | Bad request body (validation failure, missing required field, malformed file) |
| `403` | Blocked by `queryGuard` — dangerous query, needs `{ confirmed: true }` |
| `404` | Connection id (or, implicitly, table) not found |
| `500` | Unexpected server error — driver error, decryption failure, missing `GROQ_API_KEY`, etc. |
| `502` | Upstream failure calling the Groq API (AI assistant routes only) |
