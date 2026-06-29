# Universal DB Editor — 7-Day Execution Plan

> **Stack:** React + TypeScript + Tailwind (Frontend) · Node.js + Express (Backend) · sqlite3, pg, mongodb (Drivers)

---

## Architecture Overview (Read this first)

```
universal-db-editor/
├── client/                      # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar/         # Connection manager + DB explorer
│   │   │   ├── DataViewer/      # Table/collection grid
│   │   │   ├── QueryPlayground/ # SQL / Mongo query editor
│   │   │   ├── SchemaViewer/    # Schema display
│   │   │   └── RecordEditor/    # CRUD modal forms
│   │   ├── hooks/               # useConnection, useQuery, useTable
│   │   ├── store/               # Zustand global state
│   │   └── api/                 # Axios calls to backend
├── server/                      # Node.js + Express
│   ├── providers/               # ⭐ Provider pattern (stretch goal built-in)
│   │   ├── BaseProvider.ts
│   │   ├── SQLiteProvider.ts
│   │   ├── PostgreSQLProvider.ts
│   │   └── MongoProvider.ts
│   ├── routes/
│   │   ├── connections.ts
│   │   ├── explorer.ts
│   │   ├── query.ts
│   │   └── crud.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── queryGuard.ts        # Blocks DROP, TRUNCATE, DELETE *
│   └── utils/
│       └── encryption.ts        # AES-256 for saved credentials
├── docker-compose.yml
└── README.md
```

**Key design decision:** Build the provider pattern from Day 1. Every DB operation goes through `BaseProvider` → concrete provider. This satisfies the stretch goal automatically and keeps your code clean.

---

## Day 1 — Project Bootstrap + Provider Architecture

**Goal:** Monorepo running, provider skeleton in place, basic Express server alive.

### 🔧 Backend

- [ ] Init server and install dependencies:
  ```bash
  mkdir universal-db-editor && cd universal-db-editor
  mkdir client server
  cd server && npm init -y
  npm install express cors dotenv better-sqlite3 pg mongodb multer
  npm install -D typescript ts-node @types/express @types/node nodemon
  ```

- [ ] Create `BaseProvider.ts` with the full interface:
  ```ts
  interface DatabaseProvider {
    connect(config: ConnectionConfig): Promise<void>
    disconnect(): Promise<void>
    listTables(): Promise<string[]>
    getSchema(table: string): Promise<SchemaInfo>
    query(sql: string, params?: any[]): Promise<QueryResult>
    findRecords(table: string, options: QueryOptions): Promise<PaginatedResult>
    insertRecord(table: string, data: Record<string, any>): Promise<void>
    updateRecord(table: string, id: any, data: Record<string, any>): Promise<void>
    deleteRecord(table: string, id: any): Promise<void>
  }
  ```

- [ ] Stub out `SQLiteProvider.ts`, `PostgreSQLProvider.ts`, `MongoProvider.ts` — method signatures only, no logic yet

- [ ] Create `ProviderRegistry.ts`:
  ```ts
  const registry: Record<string, new () => DatabaseProvider> = {
    sqlite: SQLiteProvider,
    postgresql: PostgreSQLProvider,
    mongodb: MongoProvider,
  }
  export const getProvider = (type: string) => new registry[type]()
  ```

- [ ] Scaffold Express server with all routes returning `{ ok: true }` for now:
  - `GET /api/connections`
  - `GET /api/explorer/:connId/tables`
  - `POST /api/query/:connId`
  - `GET /api/crud/:connId/:table`

- [ ] `docker-compose.yml` with Postgres test container:
  ```yaml
  services:
    postgres:
      image: postgres:15
      environment:
        POSTGRES_PASSWORD: test
        POSTGRES_DB: testdb
      ports:
        - "5432:5432"
  ```

### 🎨 Frontend

- [ ] Init React + Vite + TypeScript client:
  ```bash
  cd ../client && npm create vite@latest . -- --template react-ts
  npm install tailwindcss zustand axios
  npx tailwindcss init
  ```

- [ ] Set up Tailwind config and base CSS

- [ ] Create `connectionStore.ts` in Zustand:
  - State: `connections[]`, `activeConnectionId`, `activeTable`
  - Actions: `setConnections`, `setActiveConnection`, `setActiveTable`

- [ ] Scaffold app shell layout — empty sidebar on the left, empty main area on the right

**✅ End of Day 1 checkpoint:** `npm run dev` works on both client (port 5173) and server (port 3001). Provider skeleton compiles. Layout shell visible in browser.

---

## Day 2 — Connection Manager

**Goal:** Users can add, edit, delete, and test connections. Credentials saved encrypted.

### 🔧 Backend

- [ ] Write `utils/encryption.ts` using Node's built-in `crypto`:
  - `encrypt(text: string): string` — AES-256-GCM, returns `iv:authTag:ciphertext`
  - `decrypt(text: string): string` — reverses the above
  - AES key stored in `.env` as `ENCRYPTION_KEY`

- [ ] Create `connections.json` file store — save `{ id, name, type, encryptedConfig, isFavorite }`

- [ ] Implement all connection routes:
  - `GET /api/connections` — return all connections, **strip passwords before responding**
  - `POST /api/connections` — validate with zod, encrypt credentials, save
  - `PUT /api/connections/:id` — edit existing connection
  - `DELETE /api/connections/:id` — remove from store
  - `POST /api/connections/:id/test` — call `provider.connect()` then `disconnect()`, return `{ ok, error }`

- [ ] Add `multer` for SQLite file uploads — store files in `server/uploads/`

- [ ] Stub `queryGuard` middleware — add to all query routes (logic expanded on Day 6):
  ```ts
  const DANGEROUS = [/DROP\s+(DATABASE|TABLE)/i, /TRUNCATE/i]
  if (DANGEROUS.some(p => p.test(query))) return res.status(403).json({ error: 'Blocked' })
  ```

### 🎨 Frontend

- [ ] Build `ConnectionForm` component:
  - DB type selector: SQLite / PostgreSQL / MongoDB
  - **SQLite:** file upload input + optional path field
  - **PostgreSQL:** host / port / dbname / user / password fields + "Use connection string" toggle
  - **MongoDB:** single URI input field
  - "Save" and "Test Connection" buttons

- [ ] Build `ConnectionList` sidebar section:
  - List all saved connections with a DB-type icon (SQLite / PG / Mongo)
  - ⭐ Star button to toggle favorite (favorites pinned to top)
  - Kebab menu per connection: Edit / Delete / Reconnect
  - Click on a connection → sets `activeConnectionId` in Zustand store

- [ ] Wire "Test Connection" → calls `POST /api/connections/:id/test` → show green ✓ or red ✗ toast

**✅ End of Day 2 checkpoint:** Can save a SQLite and Postgres connection, test them, see them in the sidebar. Passwords not visible in Network tab response.

---

## Day 3 — Database Explorer + Provider Logic

**Goal:** Clicking a connection shows its tables/collections in a tree. Selecting a table prepares the data view.

### 🔧 Backend

- [ ] Implement `SQLiteProvider.ts` fully:
  - `connect()` → open file with `better-sqlite3`
  - `listTables()` → `SELECT name FROM sqlite_master WHERE type='table'`
  - `getSchema(table)` → `PRAGMA table_info(table)`
  - `findRecords(table, {page, limit, sort, filter})` → build parameterized paginated SELECT

- [ ] Implement `PostgreSQLProvider.ts` fully:
  - `connect()` → create `pg.Pool`
  - `listTables()` → `SELECT tablename FROM pg_tables WHERE schemaname='public'`
  - `listViews()` → `SELECT viewname FROM pg_views WHERE schemaname='public'`
  - `listIndexes()` → `SELECT indexname FROM pg_indexes WHERE schemaname='public'`
  - `getSchema(table)` → query `information_schema.columns`
  - `findRecords()` → parameterized SELECT with `LIMIT/OFFSET`

- [ ] Implement `MongoProvider.ts` fully:
  - `connect()` → `MongoClient.connect(uri)`
  - `listTables()` → `db.listCollections().toArray()`
  - `getSchema(collection)` → sample 5 docs, infer field names and types
  - `findRecords(collection, {page, limit, sort, filter})` → `.find(filter).skip().limit()`

- [ ] Implement explorer routes:
  - `GET /api/explorer/:connId/tables` → returns `{ tables, views, indexes }` (views/indexes only for SQL)
  - `GET /api/explorer/:connId/schema/:table` → returns column definitions

- [ ] Keep active provider instances in a server-side Map:
  ```ts
  const activeProviders = new Map<string, DatabaseProvider>()
  ```

### 🎨 Frontend

- [ ] Build `DatabaseTree` component in the sidebar (below connection list):
  - **SQL tree:**
    ```
    📁 Database
      📂 Tables
        📄 users
        📄 orders
      📂 Views
      📂 Indexes
    ```
  - **Mongo tree:**
    ```
    📁 Database
      📄 users
      📄 products
    ```
  - Clicking a table/collection → `setActiveTable` in Zustand store

- [ ] Show active connection name + type badge in sidebar header

- [ ] Fetch tree data on connection click → `GET /api/explorer/:connId/tables`

**✅ End of Day 3 checkpoint:** Click a Postgres connection → sidebar tree shows all tables, views, indexes. Click MongoDB → shows all collections.

---

## Day 4 — Data Viewer + CRUD Operations

**Goal:** Click a table → see paginated, sortable, searchable data grid. Can create, edit, delete rows.

### 🔧 Backend

- [ ] Implement CRUD routes with full server-side processing:
  - `GET /api/crud/:connId/:table?page=1&limit=50&sort=id&order=asc&search=john`
    - Always apply `LIMIT/OFFSET` — never return unbounded results
    - Return `{ rows, total, page, limit }`
  - `POST /api/crud/:connId/:table` — insert one record
  - `PUT /api/crud/:connId/:table/:id` — update by primary key
  - `DELETE /api/crud/:connId/:table/:id` — delete by primary key (requires `{ confirmed: true }` in body)

- [ ] MongoDB specifics:
  - Serialize `_id` (ObjectId) as string in responses
  - Parse string back to ObjectId on update/delete

- [ ] Guard: `DELETE` request missing `:id` → return 400 `"Bulk delete requires explicit confirmation"`

### 🎨 Frontend

- [ ] Install TanStack Table:
  ```bash
  npm install @tanstack/react-table
  ```

- [ ] Build `DataGrid` component:
  - Auto-generate columns from schema returned by explorer
  - Sticky header row
  - Pagination bar: Previous / Next buttons + current page display + page size selector (25 / 50 / 100)
  - Click column header to sort (toggle asc/desc, send to server)
  - Search bar — debounced 300ms, triggers new fetch with `?search=` param
  - Row selection checkboxes (for multi-delete)

- [ ] Build `RecordEditor` modal:
  - "＋ Add Row" button → opens modal with blank form, field types from schema
  - Click any row → opens modal pre-filled for editing
  - "Delete" button (single or multi-select) → shows confirmation dialog:
    > *"This will permanently delete X record(s). Type DELETE to confirm."*
  - On confirm → calls DELETE API

**✅ End of Day 4 checkpoint:** Browse paginated data from all 3 DB types. Insert, edit, delete records with confirmation dialog.

---

## Day 5 — Query Playground + Schema Viewer + Import / Export

**Goal:** Full query editor with history. Schema display. CSV/JSON/SQL export and CSV/JSON import.

### 🔧 Backend

- [ ] Implement query route: `POST /api/query/:connId`
  - Body: `{ query: string }`
  - Pass through `queryGuard` middleware
  - Return: `{ columns, rows, rowCount, executionTimeMs }`
  - MongoDB: accept `db.collection.find({})` syntax → parse collection name and method, execute via driver

- [ ] Query history — persist last 50 queries per connection in `queryHistory.json`:
  - `GET /api/query/:connId/history`
  - Auto-append on each successful query execution

- [ ] Export routes (stream responses for large data):
  - `GET /api/export/:connId/:table?format=csv` → stream CSV with headers
  - `GET /api/export/:connId/:table?format=json` → stream JSON array
  - `GET /api/export/:connId/:table?format=sql` → generate `INSERT INTO ...` statements

- [ ] Import routes:
  - `POST /api/import/:connId/:table` — accept CSV or JSON via `multer`
  - Parse rows, bulk insert via provider, return `{ inserted, errors }`

### 🎨 Frontend

- [ ] Install CodeMirror:
  ```bash
  npm install codemirror @codemirror/lang-sql @codemirror/lang-javascript
  ```

- [ ] Build `QueryPlayground` component:
  - CodeMirror editor — SQL mode for SQLite/Postgres, JS mode for MongoDB
  - "▶ Run" button + `Ctrl+Enter` keyboard shortcut
  - Results grid below (reuse `DataGrid` component)
  - Collapsible query history panel on the right — click any entry to restore it in the editor
  - Export dropdown on results toolbar: CSV / JSON / SQL Dump

- [ ] Build `SchemaViewer` tab (shown when clicking a table in the tree):
  - **SQL:** display full `CREATE TABLE` DDL with CodeMirror syntax highlighting (read-only)
  - **MongoDB:** show inferred field list with types + index metadata

- [ ] Import button in `DataGrid` toolbar:
  - File picker (`.csv` or `.json`)
  - Calls `POST /api/import/:connId/:table`
  - Shows result toast: "✓ 250 rows imported" or error list

**✅ End of Day 5 checkpoint:** Can run SQL queries, see results, export to CSV. Schema DDL displayed. Import a CSV into a table.

---

## Day 6 — Security Hardening + Visual Query Builder + Relationship Viewer

**Goal:** Lock down all security requirements. Add two advanced features for extra eval marks.

### 🔧 Backend

**Security**

- [ ] Expand `queryGuard` middleware with full pattern list:
  ```ts
  const DANGEROUS_PATTERNS = [
    /DROP\s+(DATABASE|TABLE|INDEX|SCHEMA)/i,
    /TRUNCATE(\s+TABLE)?/i,
    /DELETE\s+FROM\s+\w+\s*(?!.*WHERE)/i,  // DELETE without WHERE
    /ALTER\s+TABLE.+DROP\s+COLUMN/i,
  ]
  // Return: 403 { error: "Dangerous operation blocked", requiresConfirmation: true }
  ```

- [ ] Add `helmet` middleware to Express for security headers:
  ```bash
  npm install helmet zod
  ```

- [ ] Add `zod` validation schemas for all `POST`/`PUT` request bodies — reject malformed connection strings before they reach the provider

- [ ] Relationship route:
  - `GET /api/explorer/:connId/relationships`
  - **PostgreSQL:** query `information_schema.table_constraints` + `key_column_usage` for FK data
  - **SQLite:** call `PRAGMA foreign_key_list(table)` for each table, aggregate results

### 🎨 Frontend

**Security Flow**

- [ ] When any API returns `{ requiresConfirmation: true }` → show a modal:
  > *"This is a dangerous operation. Type CONFIRM to proceed."*
  - On confirm → re-submit original request with `{ confirmed: true }` in body

**Visual Query Builder**

- [ ] Build `QueryBuilder` component (toggled via "Builder / SQL" switch in playground toolbar):
  - Step 1 — Table: dropdown populated from `DatabaseTree`
  - Step 2 — Columns: checkbox list from schema (select all by default)
  - Step 3 — Filters: dynamic rows of `[column dropdown] [operator dropdown] [value input]`, with "＋ Add Filter" button
  - Step 4 — "Generate Query" button → builds SQL string → pastes into `QueryPlayground` editor
  - Builder does not execute — it only generates. User hits Run from the playground.

**Relationship Viewer**

- [ ] Build `ERDiagram` component using plain SVG (no extra library):
  - Render one box per table with column names listed inside
  - Draw lines between boxes for each FK relationship
  - Position boxes in a simple auto-grid layout
  - Show as a tab in the main content area when "Relationships" is clicked in sidebar

**✅ End of Day 6 checkpoint:** Dangerous queries are blocked. Visual query builder generates valid SQL. ER diagram shows FK links for SQL databases.

---

## Day 7 — Docker, Tests, Docs, UI Polish

**Goal:** Shippable deliverable. Everything working, documented, containerized, tested.

### 🔧 Backend

**Docker**

- [ ] `server/Dockerfile`:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build
  CMD ["node", "dist/index.js"]
  ```

- [ ] Update `docker-compose.yml` to orchestrate server + postgres test container

- [ ] Test full `docker compose up` — server must start cleanly and connect to Postgres container

**Testing**

- [ ] Install test dependencies:
  ```bash
  npm install -D vitest supertest @types/supertest
  ```

- [ ] Write 4 test files (minimum for eval):
  - `queryGuard.test.ts` — assert dangerous queries are blocked, safe queries pass
  - `encryption.test.ts` — encrypt → decrypt round-trip returns original string
  - `SQLiteProvider.test.ts` — connect to in-memory SQLite, `listTables()`, `findRecords()`
  - `connections.test.ts` — full CRUD on `/api/connections` via supertest

**Documentation**

- [ ] `README.md` — overview, prerequisites, local setup (`npm run dev`), Docker setup, env variables table
- [ ] `API_DOCS.md` — every endpoint: method, path, request body, response shape, error codes
- [ ] `ARCHITECTURE.md` — explain provider pattern, how to register a new database (MySQL example)

### 🎨 Frontend

**Docker**

- [ ] `client/Dockerfile` — build static with Vite, serve with nginx:
  ```dockerfile
  FROM node:20-alpine AS build
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  FROM nginx:alpine
  COPY --from=build /app/dist /usr/share/nginx/html
  ```

- [ ] Add client service to `docker-compose.yml`

**UI Polish**

- [ ] Dark mode toggle in the header bar (Tailwind `dark:` classes, save preference in localStorage)
- [ ] Loading spinners on all async operations (fetch tables, run query, load grid)
- [ ] Error toast component — shown on failed connections, blocked queries, import errors
- [ ] Empty states — "No tables found", "Run a query to see results", "No connections yet"
- [ ] Responsive layout — sidebar collapses to hamburger icon on screens < 768px

**✅ Final checklist before submission**

- [ ] All CRUD operations work across SQLite, PostgreSQL, and MongoDB
- [ ] Query playground works with history, syntax highlighting, and export
- [ ] Dangerous queries blocked — confirmation flow works end-to-end
- [ ] Credentials encrypted at rest, passwords never returned to frontend
- [ ] `docker compose up` runs cleanly
- [ ] All 4 unit test files pass (`npm test`)
- [ ] `README.md`, `API_DOCS.md`, `ARCHITECTURE.md` present and complete
- [ ] Pushed to GitHub: `github.com/Soham-Satpute/universal-db-editor`

---

## Priority Map (if you run short on time)

| Priority | Feature | Why |
|----------|---------|-----|
| P0 — Must | Connection manager, Data viewer, CRUD, Query playground | Core of the eval |
| P0 — Must | Provider pattern (BaseProvider + 3 implementations) | Architecture = 20% of score |
| P0 — Must | queryGuard + credential encryption | Security = 15% of score |
| P1 — Should | Schema viewer, Import/Export, Docker | Deliverables checklist |
| P1 — Should | Unit tests (4 files minimum) | Testing = 10% of score |
| P2 — Nice | Visual Query Builder, ER diagram | Advanced requirements |
| P3 — Skip | AI query generator, Saved queries, DB comparison | Bonus only |

---

## Quick Reference

**Dangerous query regex:**
```ts
const DANGEROUS_PATTERNS = [
  /DROP\s+(DATABASE|TABLE|INDEX|SCHEMA)/i,
  /TRUNCATE(\s+TABLE)?/i,
  /DELETE\s+FROM\s+\w+\s*(?!.*WHERE)/i,
  /ALTER\s+TABLE.+DROP\s+COLUMN/i,
]
```

**Dev notes:**
- SQLite uploads → `multer`, store in `server/uploads/`, pass file path to provider
- MongoDB `_id` → always serialize ObjectId as string in API responses, parse back on write
- Postgres → use `pg.Pool` not `pg.Client` (handles reconnects automatically)
- Never `SELECT *` without `LIMIT` — enforce pagination inside every provider's `findRecords()`
- Active provider instances → keep in a `Map<connId, DatabaseProvider>` on the server, not per-request
