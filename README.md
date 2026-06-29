# Universal DB Editor

A web-based admin tool for browsing and editing SQLite, PostgreSQL,
and MongoDB databases through one consistent UI — connection
manager, table/collection browser, paginated data grid with CRUD,
a query playground (SQL or Mongo shell syntax) with history and
export, schema viewer, visual query builder, and an ER diagram for
foreign-key relationships.

See [`UNIVERSAL_DB_EDITOR_PLAN.md`](./UNIVERSAL_DB_EDITOR_PLAN.md)
for the day-by-day build plan this followed, and
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for how the provider pattern
works and how to add a new database type. Full endpoint reference is
in [`API_DOCS.md`](./API_DOCS.md).

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind, Zustand for
  state, a hand-rolled data grid (sortable/searchable/paginated,
  no table library), CodeMirror for the query editor.
- **Backend:** Node.js + Express, provider pattern over
  `better-sqlite3` / `pg` / `mongodb`.

```
universal-db-editor/
├── client/              # React + Vite frontend
├── server/              # Express backend
│   ├── src/
│   │   ├── providers/   # BaseProvider + SQLite/Postgres/Mongo implementations
│   │   ├── routes/      # connections, explorer, query, crud, export, import
│   │   ├── middleware/  # auth, queryGuard
│   │   ├── utils/       # encryption, connectionStore, queryHistory
│   │   └── __tests__/   # vitest unit + integration tests
│   ├── Dockerfile
│   └── data/            # connections.json, query-history.json (gitignored except .gitkeep)
├── docker-compose.yml    # server + Postgres test container
├── ARCHITECTURE.md
└── API_DOCS.md
```

## Prerequisites

- Node.js 20+ and npm
- For local (non-Docker) backend dev: a C++ toolchain (`python3`,
  `make`, `g++`/`clang`) so `better-sqlite3` can compile its native
  addon on `npm install`, *or* a network connection to fetch a
  prebuilt binary. Not needed if you run the backend via Docker
  (see below) — the image handles this in the build stage.
- Docker + Docker Compose, if you want to run everything containerized.

## Local setup

### Backend

```bash
cd server
npm install
cp .env.example .env
# edit .env — set a real ENCRYPTION_KEY (see table below)
npm run dev
```

Server boots on `http://localhost:3001`.

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/connections
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Opens on `http://localhost:5173`, proxying `/api/*` to the backend
on `:3001`. Run both dev servers side by side for the full stack.

### Postgres test container (optional, for testing the Postgres provider)

```bash
docker compose up -d postgres
```

Spins up Postgres 15 on `localhost:5432` (db `testdb`, user
`postgres`, password `test`).

## Docker setup (full stack)

```bash
docker compose up --build
```

This builds and starts:
- `postgres` — Postgres 15 test container, with a healthcheck so the
  server waits for it to be ready
- `server` — the Express backend, built via `server/Dockerfile`
  (multi-stage: compiles TypeScript + the `better-sqlite3` native
  addon in a build stage, copies the result into a slim runtime
  image), exposed on `localhost:3001`
- `client` — the Vite frontend, built via `client/Dockerfile`
  (multi-stage: `npm run build` in a Node build stage, the resulting
  `dist/` served by nginx — see `client/nginx.conf`, which also
  proxies `/api/*` to the `server` container), exposed on
  `localhost:8080`

`server`'s `data/` and `uploads/` directories are Docker named
volumes (`server_data`, `server_uploads`), so saved connections and
uploaded SQLite files persist across `docker compose down` / `up`
(but not `docker compose down -v`).

## Environment variables (`server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | Port the Express server listens on |
| `ENCRYPTION_KEY` | **Yes** | — | AES-256 key used to encrypt saved connection credentials at rest. Accepts either a 64-character hex string or a plain string (padded/truncated to 32 bytes). Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Never commit a real key or reuse the placeholder from `.env.example` in production.** |

## Testing

```bash
cd server
npm test
```

Runs the vitest suite (`vitest run`):

| File | Covers |
|---|---|
| `encryption.test.ts` | AES-256-GCM `encrypt()`/`decrypt()` round-trip, tamper detection, malformed-input handling |
| `queryGuard.test.ts` | Dangerous SQL patterns blocked (`DROP`, `TRUNCATE`, unconditioned `DELETE`, `ALTER ... DROP COLUMN`), safe queries pass, `confirmed: true` bypass |
| `SQLiteProvider.test.ts` | `connect()`/`listTables()`/`getSchema()`/`findRecords()` (pagination + sort)/insert/update/delete against a real on-disk SQLite fixture |
| `connections.test.ts` | Full CRUD on `/api/connections` via `supertest`, asserting credentials never leak in any response |

> `SQLiteProvider.test.ts` needs the compiled `better-sqlite3` native
> addon, same as running the app locally — see Prerequisites above.

## Security notes

- Connection credentials are AES-256-GCM encrypted before being
  written to `server/data/connections.json`; passwords/URIs are
  stripped from every API response.
- `queryGuard` middleware blocks destructive SQL patterns on the
  query playground unless the request explicitly confirms them.
- `helmet` adds standard security headers; `zod` validates every
  connection create/update body before it reaches a provider.
- Every paginated read enforces a `LIMIT`/`OFFSET` (or
  `.skip().limit()` for Mongo) server-side — there's no code path
  that returns an unbounded result set.

## Status

Backend: Days 1–7 complete (provider pattern, connections, explorer,
CRUD, query playground + history, export/import, security hardening,
Docker, tests, docs). Frontend: Days 1–7 complete per the plan —
Day 7 added the nginx-served Docker image, a dark/light theme toggle
(persisted in `localStorage`, defaults to dark), a shared toast
component for transient notifications (connection actions, import
results), and a mobile sidebar drawer (hamburger toggle below 768px).
Loading/error/empty states across the data grid, query playground,
schema viewer, and ER diagram were already in place from earlier
days and are unchanged.

Known gaps, not part of the Day 7 checklist: the embedded CodeMirror
editor keeps its one-dark theme regardless of the app theme (a
deliberate scope call — most code editors do this); data-dense views
like the query builder and ER diagram are desktop-oriented and
haven't been adapted for narrow viewports the way the app shell has.
