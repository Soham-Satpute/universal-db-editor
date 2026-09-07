# Universal DB Editor

A modern, local-first web application for exploring, querying, and managing **SQLite**, **PostgreSQL**, and **MongoDB** databases through a single, consistent interface.

Featuring an **in-place schema tree**, an interactive **paginated data grid** with inline editing, a **dual-mode Query Playground** (SQL and Mongo shell syntax) with **Groq-powered AI assistance**, visual **ER diagrams**, **index management**, and both **per-table and full-database export/import**.

---

## Key Features

- **Unified Connection Manager**
  - Connect to local or remote **SQLite** files, **PostgreSQL** servers, and **MongoDB** clusters.
  - **Auto-detection**: Pasting a `postgresql://` or `mongodb://` connection string into the Host field automatically switches the form into connection-string mode.
  - Credentials are encrypted at rest with **AES-256-GCM**; secrets (`password`, `uri`) are never exposed in API responses.
- **In-Place Schema Explorer**
  - Browse tables, collections, views, and indexes directly in an expandable sidebar tree.
  - Quick action menu for full-database exports and index creation/removal.
- **Interactive Data Grid**
  - Fast, hand-rolled data grid with sorting, full-text search, and server-side pagination.
  - **Inline cell editing**: Double-click any cell to edit in place and press Enter to save.
  - Add new records with schema-aware input modals and delete records with safety confirmation.
- **Dual-Mode Query Playground**
  - **SQL Mode** for PostgreSQL and SQLite with syntax highlighting and formatting.
  - **Mongo Shell Mode** for MongoDB (`db.collection.find(...)`, `findOne(...)`, `countDocuments(...)`, `aggregate(...)`).
  - **Visual Query Builder**: Point-and-click SELECT query generator.
  - **AI Assistant**: Explain queries, auto-fix syntax errors, or autocomplete queries using Groq LLMs.
  - **Query History**: Persistent query log with execution timing (ms), row counts, timestamps, and error tracing.
  - **Query Guard**: Intercepts destructive SQL operations (`DROP`, `TRUNCATE`, unconditioned `DELETE`) and demands explicit user confirmation before executing.
- **Schema Viewer & Visual ER Diagram**
  - Detailed column breakdown: data types, nullability, default values, primary keys, and indexes.
  - Interactive SVG-based **Entity-Relationship (ER) Diagram** mapping foreign-key relationships for relational databases (SQLite and PostgreSQL).
- **Index Management**
  - Inspect, create (single or composite, unique), and drop indexes across SQLite, PostgreSQL, and MongoDB.
- **Data Export & Import**
  - **Table Export**: Stream table data in CSV, JSON, or SQL format.
  - **Database Export**: Dump entire databases into one file (.sql or .json) via the sidebar.
  - **Data Import**: Upload CSV or JSON files to append records into any table.
- **Theme & Responsiveness**
  - Light and dark mode toggle persisted in `localStorage`.
  - Responsive layout: Collapsible desktop sidebar and sliding drawer for mobile screens.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript 6, Vite 8, Tailwind CSS v4, Zustand 5, CodeMirror 6, Lucide React, Axios |
| **Backend** | Node.js 20+, Express 4.19, TypeScript 5.5, `tsx watch`, `zod`, `helmet`, `cors`, `multer` |
| **Database Drivers** | `better-sqlite3` (SQLite), `pg` (PostgreSQL), `mongodb` (MongoDB) |
| **Security** | Node crypto (`aes-256-gcm`), custom `queryGuard` AST/regex middleware |
| **AI Integration** | Groq Cloud API (`llama-3.3-70b-versatile` or custom model) |
| **Testing** | Vitest 2.1, Supertest |

---

## Project Structure

```
universal-db-editor/
├── client/                     # React + Vite frontend
│   ├── src/
│   │   ├── api/                # API client modules (connections, crud, explorer, query, ai)
│   │   ├── components/
│   │   │   ├── DataViewer/     # DataGrid, inline editing, empty states
│   │   │   ├── ERDiagram/      # SVG foreign-key relationship graph
│   │   │   ├── Layout/         # Header, theme toggle
│   │   │   ├── QueryPlayground/# CodeMirror editor, Query Builder, AI menu, History
│   │   │   ├── RecordEditor/   # Add row modal
│   │   │   ├── SchemaViewer/   # Table column and index breakdown
│   │   │   └── Sidebar/        # Connection manager, tree explorer, connection modal
│   │   ├── store/              # Zustand global state (active view, active table, selection)
│   │   └── types/              # Frontend TypeScript definitions
│   └── package.json
│
├── server/                     # Express backend
│   ├── src/
│   │   ├── providers/          # Provider Pattern implementations:
│   │   │   ├── BaseProvider.ts        # Abstract provider base class
│   │   │   ├── SQLiteProvider.ts      # better-sqlite3 provider
│   │   │   ├── PostgreSQLProvider.ts  # pg pool provider (multi-statement support)
│   │   │   ├── MongoProvider.ts       # mongodb driver provider
│   │   │   └── ProviderRegistry.ts    # Provider factory and active instance cache
│   │   ├── routes/             # REST endpoints (connections, crud, explorer, query, ai, etc.)
│   │   ├── middleware/         # queryGuard (safety checks), multer uploads
│   │   ├── utils/              # AES-256-GCM encryption, connectionStore, queryHistory
│   │   ├── types/              # DatabaseProvider interfaces, query options
│   │   └── __tests__/          # Vitest test suite (84 tests)
│   ├── data/                   # Encrypted connections & query history (local storage)
│   ├── postman/                # Postman collection for all REST endpoints
│   └── package.json
│
├── postgres-seed.sql           # PostgreSQL test seed script (books, authors, orders)
├── mongo-seed.js               # MongoDB test seed script
├── test.db                     # Ready-to-use SQLite test database
├── API_DOCS.md                 # Complete REST API reference
├── ARCHITECTURE.md             # In-depth architectural design & provider guide
├── DESIGN.md                   # UI tokens, color palette, and component design rules
└── README.md
```

---

## Prerequisites

- **Node.js 20+** and **npm**
- *(Optional for SQLite)* A C++ compiler toolchain (`make`, `g++` / Visual Studio Build Tools) if `better-sqlite3` needs to build native bindings locally on your platform.
- *(Optional for PostgreSQL/MongoDB)* Local or remote running instances of PostgreSQL and/or MongoDB.

---

## Local Setup

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` to configure your encryption key and optional AI key:

```env
PORT=3001
ENCRYPTION_KEY=replace_with_a_32_byte_random_string
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

> **Generating an encryption key:**
> Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` in your terminal and paste the resulting string as your `ENCRYPTION_KEY`.

Start the backend in watch mode:

```bash
npm run dev
```
*The server boots on `http://localhost:3001`.*

### 2. Frontend

In a separate terminal window:

```bash
cd client
npm install
npm run dev
```
*The client boots on `http://localhost:5173` and proxies API requests to `:3001`.*

---

## Environment Variables (`server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | Port for the Express server to listen on. |
| `ENCRYPTION_KEY` | **Yes** | — | 32-byte string or 64-char hex string used for AES-256-GCM credential encryption. |
| `GROQ_API_KEY` | No | — | API key from [console.groq.com](https://console.groq.com/keys) for Query Playground AI features (autocomplete / explain / fix). |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Overrides the default Groq LLM model. |

---

## Seeding Sample Test Data

The repository includes ready-to-use test datasets for all three database engines:

### SQLite
A pre-seeded SQLite database is available immediately at `test.db` in the repository root. Simply add a new SQLite connection and set the file path to `../test.db` or the full absolute path.

### PostgreSQL
Run the provided [postgres-seed.sql](./postgres-seed.sql) to create `authors`, `books`, `customers`, `orders`, and `order_items`:
```bash
# Using psql:
psql -U postgres -d postgres -f postgres-seed.sql

# Or paste the contents directly into the Query Playground after connecting!
```

### MongoDB
Run the provided [mongo-seed.js](./mongo-seed.js) with `mongosh`:
```bash
mongosh mongodb://localhost:27017/bookstore mongo-seed.js
```

---

## Query Playground Syntax Guide

### SQL (PostgreSQL & SQLite)
Write standard SQL statements:
```sql
SELECT b.title, a.name AS author, b.price, b.stock
FROM books b
JOIN authors a ON b.author_id = a.id
ORDER BY b.stock DESC;
```

### MongoDB (Shell Syntax)
The Query Playground parses expressions in standard Mongo shell format:

- **Find records:**
  ```javascript
  db.books.find({ "genre": "Dystopian" })
  ```
- **Find single document:**
  ```javascript
  db.customers.findOne({ "city": "Tokyo" })
  ```
- **Count documents:**
  ```javascript
  db.orders.countDocuments({ "status": "delivered" })
  ```
- **Aggregation pipeline:**
  ```javascript
  db.books.aggregate([
    { "$group": { "_id": "$genre", "count": { "$sum": 1 }, "avgPrice": { "$avg": "$price" } } },
    { "$sort": { "count": -1 } }
  ])
  ```

---

## Testing

The backend includes a comprehensive **Vitest** test suite with **84 automated tests**:

```bash
cd server
npm test
```

| Test File | Test Count | Coverage |
|---|---|---|
| `MongoProvider.test.ts` | 25 tests | Connect/disconnect, collection listing, index CRUD, schema sampling, pagination, ObjectId serialization |
| `PostgreSQLProvider.test.ts` | 25 tests | Discrete fields & URI parsing, schema reflection, PK detection, parameter binding, index CRUD, multi-statement queries |
| `connections.test.ts` | 11 tests | End-to-end connection CRUD via Supertest, validation, credential stripping in responses |
| `queryGuard.test.ts` | 10 tests | Interception of destructive SQL (`DROP`, `TRUNCATE`, unconditioned `DELETE`), confirmation override verification |
| `SQLiteProvider.test.ts` | 7 tests | Real on-disk SQLite test fixture covering table listing, schema, CRUD, pagination, and index management |
| `encryption.test.ts` | 6 tests | AES-256-GCM `encrypt()`/`decrypt()` round-trips, tamper detection, malformed input handling |

To verify the client build:
```bash
cd client
npm run build
```

---

## Security Architecture

1. **Encrypted Credentials at Rest:** All database credentials saved via `/api/connections` are encrypted using **AES-256-GCM** with a per-record initialization vector (`iv`) and authentication tag (`tag`). They are persisted in `server/data/connections.json`.
2. **Zero Credential Leaks:** All API endpoints strip sensitive fields (`password`, `uri`) from connection objects before sending responses to the client.
3. **Query Safety Guard:** The `queryGuard` Express middleware analyzes query text. Destructive commands (`DROP`, `TRUNCATE`, `DELETE` without a `WHERE` clause, `ALTER ... DROP COLUMN`) return an error requiring explicit `{ confirmed: true }` approval from the user.
4. **Enforced Bounded Pagination:** All `findRecords` calls enforce strict server-side `LIMIT` and `OFFSET` (or `.skip().limit()`), preventing unbounded memory consumption.
5. **Schema Validation & Headers:** All connection creation/update payloads are validated with **Zod**; **Helmet** enforces standard security HTTP headers.

---

## Documentation Links

- [Architecture Guide (`ARCHITECTURE.md`)](./ARCHITECTURE.md) — Detailed explanation of the Provider Pattern and how to add a new database engine.
- [REST API Reference (`API_DOCS.md`)](./API_DOCS.md) — Exhaustive documentation of all endpoints, request shapes, and response schemas.
- [Postman Collection](./server/postman/Universal-DB-Editor.postman_collection.json) — Importable collection covering all endpoints.
- [UI Design System (`DESIGN.md`)](./DESIGN.md) — Aesthetic tokens, typography, and layout rules.
