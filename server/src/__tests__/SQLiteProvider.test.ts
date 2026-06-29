import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SQLiteProvider } from "../providers/SQLiteProvider";

describe("SQLiteProvider", () => {
  let dbPath: string;
  let tmpDir: string;
  let provider: SQLiteProvider;

  beforeAll(async () => {
    // Build a small fixture database on disk (better-sqlite3's
    // fileMustExist: true in SQLiteProvider.connect() requires the
    // file to already exist).
    tmpDir = mkdtempSync(join(tmpdir(), "udbe-sqlite-test-"));
    dbPath = join(tmpDir, "fixture.sqlite");

    const setup = new Database(dbPath);
    setup.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT
      );
    `);
    const insert = setup.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
    insert.run("Ada Lovelace", "ada@example.com");
    insert.run("Alan Turing", "alan@example.com");
    insert.run("Grace Hopper", null);
    setup.close();

    provider = new SQLiteProvider();
    await provider.connect({ type: "sqlite", filePath: dbPath });
  });

  afterAll(async () => {
    await provider?.disconnect();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists tables", async () => {
    const tables = await provider.listTables();
    expect(tables).toContain("users");
  });

  it("returns column schema with primary key flagged", async () => {
    const schema = await provider.getSchema("users");
    expect(schema.table).toBe("users");
    const names = schema.columns.map((c) => c.name);
    expect(names).toEqual(["id", "name", "email"]);
    const idCol = schema.columns.find((c) => c.name === "id");
    expect(idCol?.isPrimaryKey).toBe(true);
  });

  it("finds paginated records", async () => {
    const result = await provider.findRecords("users", { page: 1, limit: 2 });
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);
  });

  it("respects sort direction", async () => {
    const result = await provider.findRecords("users", {
      page: 1,
      limit: 10,
      sort: { field: "name", direction: "desc" },
    });
    const names = result.rows.map((r) => r.name);
    expect(names).toEqual(["Grace Hopper", "Alan Turing", "Ada Lovelace"]);
  });

  it("inserts, updates, and deletes a record", async () => {
    await provider.insertRecord("users", { name: "Margaret Hamilton", email: "margaret@example.com" });
    let result = await provider.findRecords("users", { page: 1, limit: 10 });
    expect(result.total).toBe(4);

    const inserted = result.rows.find((r) => r.name === "Margaret Hamilton");
    expect(inserted).toBeDefined();
    const id = inserted!.id as number;

    await provider.updateRecord("users", id, { email: "margaret.h@example.com" });
    result = await provider.findRecords("users", { page: 1, limit: 10, filter: { id } });
    expect(result.rows[0].email).toBe("margaret.h@example.com");

    await provider.deleteRecord("users", id);
    result = await provider.findRecords("users", { page: 1, limit: 10 });
    expect(result.total).toBe(3);
  });

  it("runs a raw SELECT query via query()", async () => {
    const result = await provider.query("SELECT COUNT(*) as count FROM users");
    expect(result.rows[0].count).toBe(3);
  });

  it("throws if a method is called before connect()", async () => {
    const fresh = new SQLiteProvider();
    await expect(fresh.listTables()).rejects.toThrow(/not connected/i);
  });
});
