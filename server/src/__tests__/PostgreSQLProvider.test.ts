import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PostgreSQLProvider talks to a real Postgres server via `pg`'s Pool.
 * There's no Postgres instance available in the test environment, so
 * the driver itself is mocked here — these are unit tests that verify
 * PostgreSQLProvider builds the right SQL/params and maps `pg`'s
 * response shape correctly, not integration tests against a live DB.
 */
const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
};

vi.mock("pg", () => {
  return {
    Pool: vi.fn().mockImplementation(() => mockPool),
  };
});

import { Pool } from "pg";
import { PostgreSQLProvider } from "../providers/PostgreSQLProvider";

function queryResult<T>(rows: T[], overrides: Partial<{ rowCount: number; fields: { name: string }[] }> = {}) {
  return {
    rows,
    rowCount: overrides.rowCount ?? rows.length,
    fields: overrides.fields ?? [],
  };
}

describe("PostgreSQLProvider", () => {
  let provider: PostgreSQLProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPool.query.mockResolvedValue(queryResult([]));
    provider = new PostgreSQLProvider();
    await provider.connect({ type: "postgresql", host: "localhost", port: 5432, database: "app", user: "postgres", password: "secret" });
    mockPool.query.mockClear(); // clear the "SELECT 1" ping from connect()
  });

  it("throws if a method is called before connect()", async () => {
    const fresh = new PostgreSQLProvider();
    await expect(fresh.listTables()).rejects.toThrow(/not connected/i);
  });

  it("connects using discrete host/port/database fields when no connectionString is given", async () => {
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ host: "localhost", port: 5432, database: "app", user: "postgres", password: "secret" }),
    );
    // connect() pings the pool to confirm the connection is live.
    // (Verified indirectly: connect() above resolved without throwing.)
  });

  it("connects using a connectionString when provided, ignoring discrete fields", async () => {
    vi.clearAllMocks();
    mockPool.query.mockResolvedValue(queryResult([]));
    const p = new PostgreSQLProvider();
    await p.connect({ type: "postgresql", connectionString: "postgres://user:pw@host:5432/db" });
    expect(Pool).toHaveBeenCalledWith({ connectionString: "postgres://user:pw@host:5432/db" });
  });

  it("disconnect() ends the pool and blocks further calls", async () => {
    await provider.disconnect();
    expect(mockPool.end).toHaveBeenCalledOnce();
    await expect(provider.listTables()).rejects.toThrow(/not connected/i);
  });

  it("lists tables from pg_tables scoped to the public schema", async () => {
    mockPool.query.mockResolvedValueOnce(queryResult([{ tablename: "users" }, { tablename: "orders" }]));
    const tables = await provider.listTables();
    expect(tables).toEqual(["users", "orders"]);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/pg_tables/i));
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("schemaname = 'public'"));
  });

  it("lists views from pg_views", async () => {
    mockPool.query.mockResolvedValueOnce(queryResult([{ viewname: "active_users" }]));
    const views = await provider.listViews();
    expect(views).toEqual(["active_users"]);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/pg_views/i));
  });

  it("lists index names from pg_indexes", async () => {
    mockPool.query.mockResolvedValueOnce(queryResult([{ indexname: "users_pkey" }]));
    const indexes = await provider.listIndexes();
    expect(indexes).toEqual(["users_pkey"]);
  });

  describe("listIndexDetails()", () => {
    it("parses column list and unique flag out of indexdef", async () => {
      mockPool.query.mockResolvedValueOnce(
        queryResult([
          {
            indexname: "users_email_key",
            tablename: "users",
            indexdef: 'CREATE UNIQUE INDEX users_email_key ON public.users USING btree ("email")',
          },
          {
            indexname: "orders_user_id_idx",
            tablename: "orders",
            indexdef: 'CREATE INDEX orders_user_id_idx ON public.orders USING btree ("user_id", "created_at")',
          },
        ]),
      );

      const details = await provider.listIndexDetails();
      expect(details).toEqual([
        { name: "users_email_key", table: "users", columns: ["email"], unique: true },
        { name: "orders_user_id_idx", table: "orders", columns: ["user_id", "created_at"], unique: false },
      ]);
    });

    it("returns an empty column list if indexdef has no parenthesized column list", async () => {
      mockPool.query.mockResolvedValueOnce(
        queryResult([{ indexname: "weird_idx", tablename: "t", indexdef: "CREATE INDEX weird_idx ON public.t" }]),
      );
      const details = await provider.listIndexDetails();
      expect(details[0].columns).toEqual([]);
    });
  });

  describe("createIndex()", () => {
    it("builds a plain CREATE INDEX statement with a generated name", async () => {
      const name = await provider.createIndex("users", ["email"]);
      expect(name).toBe("idx_users_email");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringMatching(/^CREATE INDEX "idx_users_email" ON "users" \("email"\)$/),
      );
    });

    it("builds a UNIQUE CREATE INDEX statement and honors a custom name", async () => {
      const name = await provider.createIndex("users", ["email"], { unique: true, name: "uq_users_email" });
      expect(name).toBe("uq_users_email");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringMatching(/^CREATE UNIQUE INDEX "uq_users_email" ON "users" \("email"\)$/),
      );
    });

    it("supports composite indexes across multiple columns", async () => {
      await provider.createIndex("orders", ["user_id", "created_at"]);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('("user_id", "created_at")'),
      );
    });

    it("rejects an empty column list", async () => {
      await expect(provider.createIndex("users", [])).rejects.toThrow(/at least one column/i);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  it("dropIndex() issues a quoted DROP INDEX statement", async () => {
    await provider.dropIndex("users_email_key");
    expect(mockPool.query).toHaveBeenCalledWith('DROP INDEX "users_email_key"');
  });

  it("getSchema() maps information_schema rows into ColumnInfo, flagging the primary key", async () => {
    mockPool.query.mockResolvedValueOnce(
      queryResult([
        { column_name: "id", data_type: "integer", is_nullable: "NO", column_default: "nextval(...)", is_primary_key: true },
        { column_name: "email", data_type: "text", is_nullable: "YES", column_default: null, is_primary_key: false },
      ]),
    );

    const schema = await provider.getSchema("users");
    expect(schema.table).toBe("users");
    expect(schema.columns).toEqual([
      { name: "id", type: "integer", nullable: false, isPrimaryKey: true, defaultValue: "nextval(...)" },
      { name: "email", type: "text", nullable: true, isPrimaryKey: false, defaultValue: null },
    ]);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("information_schema.columns"), ["users"]);
  });

  describe("query()", () => {
    it("returns rows, rowCount, and field names from a raw query", async () => {
      mockPool.query.mockResolvedValueOnce(
        queryResult([{ count: "3" }], { rowCount: 1, fields: [{ name: "count" }] }),
      );
      const result = await provider.query("SELECT COUNT(*) as count FROM users");
      expect(result).toEqual({ rows: [{ count: "3" }], rowCount: 1, fields: ["count"] });
    });

    it("falls back to rows.length when the driver reports a null rowCount", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ a: 1 }, { a: 2 }], rowCount: null, fields: [{ name: "a" }] });
      const result = await provider.query("SELECT a FROM t");
      expect(result.rowCount).toBe(2);
    });

    it("forwards params through to the underlying pool", async () => {
      await provider.query("SELECT * FROM users WHERE id = $1", [42]);
      expect(mockPool.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [42]);
    });
  });

  describe("findRecords()", () => {
    it("builds an unfiltered, unsorted paginated query with default page/limit", async () => {
      mockPool.query
        .mockResolvedValueOnce(queryResult([{ id: 1 }, { id: 2 }]))
        .mockResolvedValueOnce(queryResult([{ total: "2" }]));

      const result = await provider.findRecords("users", {});
      expect(result).toEqual({ rows: [{ id: 1 }, { id: 2 }], total: 2, page: 1, limit: 50 });

      const [selectSql, selectParams] = mockPool.query.mock.calls[0];
      expect(selectSql).toContain('FROM "users"');
      expect(selectSql).not.toContain("WHERE");
      expect(selectSql).not.toContain("ORDER BY");
      expect(selectParams).toEqual([50, 0]); // LIMIT, OFFSET
    });

    it("applies filter, sort, and pagination together with correctly indexed placeholders", async () => {
      mockPool.query
        .mockResolvedValueOnce(queryResult([{ id: 3 }]))
        .mockResolvedValueOnce(queryResult([{ total: "1" }]));

      await provider.findRecords("users", {
        page: 2,
        limit: 10,
        filter: { status: "active" },
        sort: { field: "name", direction: "desc" },
      });

      const [selectSql, selectParams] = mockPool.query.mock.calls[0];
      expect(selectSql).toContain('WHERE "status" = $1');
      expect(selectSql).toContain('ORDER BY "name" DESC');
      expect(selectSql).toContain("LIMIT $2 OFFSET $3");
      expect(selectParams).toEqual(["active", 10, 10]); // page 2, limit 10 -> offset 10

      const [countSql, countParams] = mockPool.query.mock.calls[1];
      expect(countSql).toContain('WHERE "status" = $1');
      expect(countParams).toEqual(["active"]);
    });

    it("clamps limit to a maximum of 100 and page to a minimum of 1", async () => {
      mockPool.query
        .mockResolvedValueOnce(queryResult([]))
        .mockResolvedValueOnce(queryResult([{ total: "0" }]));

      const result = await provider.findRecords("users", { page: -5, limit: 500 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });
  });

  it("insertRecord() builds a parameterized INSERT with quoted identifiers", async () => {
    await provider.insertRecord("users", { name: "Ada", email: "ada@example.com" });
    expect(mockPool.query).toHaveBeenCalledWith(
      'INSERT INTO "users" ("name", "email") VALUES ($1, $2)',
      ["Ada", "ada@example.com"],
    );
  });

  it("updateRecord() builds a parameterized UPDATE keyed on id, with id as the final param", async () => {
    await provider.updateRecord("users", 7, { email: "new@example.com" });
    expect(mockPool.query).toHaveBeenCalledWith(
      'UPDATE "users" SET "email" = $1 WHERE id = $2',
      ["new@example.com", 7],
    );
  });

  it("deleteRecord() issues a parameterized DELETE by id", async () => {
    await provider.deleteRecord("users", 7);
    expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM "users" WHERE id = $1', [7]);
  });

  it("quotes identifiers containing double quotes safely", async () => {
    await provider.insertRecord('weird"table', { 'wei"rd': 1 });
    expect(mockPool.query).toHaveBeenCalledWith(
      'INSERT INTO "weird""table" ("wei""rd") VALUES ($1)',
      [1],
    );
  });
});
