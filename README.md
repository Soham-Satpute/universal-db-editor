# Universal DB Editor

A web-based admin tool for browsing and editing SQLite, PostgreSQL,
and MongoDB databases through one consistent UI — connection
manager (with automatic connection-string detection for Postgres),
table/collection browser with in-place expansion, paginated data
grid with CRUD, a query playground (SQL or Mongo shell syntax) with
history, export, and a Groq-powered AI assistant (autocomplete /
explain / fix), schema viewer, index management (create/drop),
visual query builder, an ER diagram for foreign-key relationships,
and both per-table and full-database export (CSV/JSON/SQL).

See [`UNIVERSAL_DB_EDITOR_PLAN.md`](./UNIVERSAL_DB_EDITOR_PLAN.md)
for the day-by-day build plan this followed, and
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for how the provider pattern
works and how to add a new database type. Full endpoint reference is
in [`API_DOCS.md`](./API_DOCS.md), and a ready-to-import
[Postman collection](./server/postman/Universal-DB-Editor.postman_collection.json)
covers every route in one file.

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
│   │   ├── routes/      # connections, explorer, query, crud, export, import, indexes, ai
│   │   ├── middleware/  # auth, queryGuard
│   │   ├── utils/       # encryption, connectionStore, queryHistory
│   │   └── __tests__/   # vitest unit + integration tests
│   ├── postman/         # Postman collection covering every route
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

`npm run dev` uses `tsx watch` (not `nodemon` + `ts-node`) — a single
process that watches and re-runs `src/index.ts` on save, noticeably
faster to restart and lighter on Windows. Server boots on
`http://localhost:3001`.

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
| `GROQ_API_KEY` | No | — | API key for the Query Playground's AI assistant (autocomplete / explain / fix), from [console.groq.com/keys](https://console.groq.com/keys). Without it, the three `/api/ai/*` endpoints respond `500` and the AI buttons in the UI surface that error — everything else works fine. |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Overrides the Groq model used for AI assistant calls. |

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
| `PostgreSQLProvider.test.ts` | Connect (discrete fields vs. `connectionString`), `listTables()`/`listViews()`/`listIndexes()`, index CRUD (`listIndexDetails()`/`createIndex()`/`dropIndex()`, including composite/unique indexes and identifier quoting), `getSchema()` PK detection, `query()`, and `findRecords()`/insert/update/delete — all against a mocked `pg.Pool` |
| `MongoProvider.test.ts` | Connect/disconnect, `listTables()` (collection names), index CRUD (`listIndexDetails()`/`createIndex()`/`dropIndex()`, compound indexes, skipping the default `_id_` index), `getSchema()` type inference by sampling documents, `ObjectId` serialization, and `findRecords()`/insert/update/delete — all against a mocked `mongodb` driver |
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
Docker, tests, docs), plus a Day 8 feature/tooling pass. Frontend:
Days 1–7 complete per the plan — Day 7 added the nginx-served Docker
image, a dark/light theme toggle (persisted in `localStorage`,
defaults to dark), a shared toast component for transient
notifications (connection actions, import results), and a mobile
sidebar drawer (hamburger toggle below 768px). Loading/error/empty
states across the data grid, query playground, schema viewer, and ER
diagram were already in place from earlier days and are unchanged.

### Day 8 pass — feedback triage

A round of user + dev feedback was checked against the actual
codebase. Most of it turned out to already be implemented (either
from earlier days or missed in prior status notes); the rest is
listed as a real gap below.

**Already done (verified in code, not just planned):**
- **Postgres connection-string auto-detect** — pasting a
  `postgres://…` / `postgresql://…` URI into the *Host* field
  (`ConnectionForm.tsx`) auto-switches the form into connection-string
  mode instead of treating it as a hostname. The manual toggle is
  still there for typing one in directly.
- **In-place connection expansion** — `Sidebar.tsx` renders the
  `DatabaseTree` inline under the connection you click, rather than
  as a separate flat-list-plus-tree layout.
- **Full-database export** — `GET /api/export/:connId?format=sql|json`
  dumps every table/collection into one file (streamed, not loaded
  into memory); wired into the sidebar's connection menu ("Export
  database (.sql)" / "(.json)"). CSV isn't offered at this level
  since a single flat file can't sensibly hold multiple tables — use
  the per-table endpoint for CSV.
- **AI query assistant** — autocomplete / explain / fix, backed by
  Groq's OpenAI-compatible API (see `GROQ_API_KEY` above), fully
  wired into the Query Playground toolbar (`AiMenu` in
  `QueryPlayground.tsx`).
- **Index management** — create/drop indexes from the schema tree
  (`DatabaseTree.tsx`'s Indexes section), backed by
  `GET/POST /api/indexes/:connId` and `DELETE /api/indexes/:connId/:name`.
  Supported for SQLite and PostgreSQL; MongoDB indexes are scoped
  per-collection via the `table` query param.
- **Postgres/Mongo provider test coverage** — `PostgreSQLProvider.test.ts`
  (25 cases) and `MongoProvider.test.ts` (26 cases) exist and cover
  connect/schema/CRUD/index management, on par with the SQLite suite.
- **`tsx watch` instead of `nodemon` + `ts-node`** — one process,
  faster restarts, no native-binding friction on Windows.
- **Postman collection** — `server/postman/Universal-DB-Editor.postman_collection.json`,
  every route, ready to import.

**Needs a decision (raised as "update option not there"):**
Single-record update already exists (`PUT /api/crud/:connId/:table/:id`),
and connection credentials are already editable in place (the sidebar's
Edit action re-opens `ConnectionForm` pre-filled, `PUT /api/connections/:id`).
What's genuinely missing is **bulk/multi-row update** — there's no way
to select several rows in the data grid and apply one change to all
of them. If that's what was meant, it's a real gap; if it's something
else, needs clarifying.

**Real gap, not yet fixed:**
- **Responsiveness is uneven, not absent.** The app shell (sidebar
  drawer, header, connection list), the data grid, and the Query
  Playground toolbar already use `sm:`/`md:` breakpoints and wrap or
  collapse sensibly on narrow viewports. The **ER diagram** is the
  one view that's still genuinely desktop-oriented: it lays out
  tables in a fixed 3-column SVG grid (`ERDiagram.tsx`) that only
  becomes usable on a phone via pinch-zoom/scroll, with no adapted
  mobile layout. The embedded CodeMirror editor also keeps its
  one-dark theme regardless of the app theme — a deliberate scope
  call, most code editors do this.
