import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { app } from "../app";

// connectionStore.ts persists to server/data/connections.json on disk.
// We snapshot it before the suite runs and restore it afterwards so
// these tests don't pollute (or get polluted by) real local data.
const STORE_PATH = join(__dirname, "../../data/connections.json");
let originalStoreContents: string | null = null;

beforeAll(() => {
  if (existsSync(STORE_PATH)) {
    originalStoreContents = readFileSync(STORE_PATH, "utf8");
  } else {
    mkdirSync(join(__dirname, "../../data"), { recursive: true });
  }
});

afterAll(() => {
  if (originalStoreContents !== null) {
    writeFileSync(STORE_PATH, originalStoreContents, "utf8");
  } else if (existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, "[]", "utf8");
  }
});

describe("/api/connections", () => {
  let createdId: string;

  it("GET / returns the connections list shape", async () => {
    const res = await request(app).get("/api/connections");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.connections)).toBe(true);
  });

  it("POST / creates a SQLite connection and never returns secrets", async () => {
    const res = await request(app)
      .post("/api/connections")
      .send({ name: "Test SQLite Conn", type: "sqlite", filePath: "/tmp/does-not-need-to-exist.sqlite" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.connection.name).toBe("Test SQLite Conn");
    expect(res.body.connection).not.toHaveProperty("encryptedConfig");

    createdId = res.body.connection.id;
  });

  it("POST / creates a PostgreSQL connection and strips the password", async () => {
    const res = await request(app)
      .post("/api/connections")
      .send({
        name: "Test Postgres Conn",
        type: "postgresql",
        host: "localhost",
        port: 5432,
        database: "testdb",
        user: "admin",
        password: "super-secret-password",
      })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    expect(res.body.connection.config.user).toBe("admin");
    expect(res.body.connection.config).not.toHaveProperty("password");
    // Make sure the password also never shows up anywhere in the raw JSON response
    expect(JSON.stringify(res.body)).not.toContain("super-secret-password");

    await request(app).delete(`/api/connections/${res.body.connection.id}`);
  });

  it("rejects a malformed body (missing required fields)", async () => {
    const res = await request(app)
      .post("/api/connections")
      .send({ name: "" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("rejects a MongoDB connection with no uri", async () => {
    const res = await request(app)
      .post("/api/connections")
      .send({ name: "No URI Mongo", type: "mongodb" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
  });

  it("GET / now includes the created connection, favorites first", async () => {
    const res = await request(app).get("/api/connections");
    const ids = res.body.connections.map((c: { id: string }) => c.id);
    expect(ids).toContain(createdId);
  });

  it("PATCH /:id/favorite toggles isFavorite", async () => {
    const res = await request(app).patch(`/api/connections/${createdId}/favorite`);
    expect(res.status).toBe(200);
    expect(res.body.isFavorite).toBe(true);

    const res2 = await request(app).patch(`/api/connections/${createdId}/favorite`);
    expect(res2.body.isFavorite).toBe(false);
  });

  it("PUT /:id updates the connection name", async () => {
    const res = await request(app)
      .put(`/api/connections/${createdId}`)
      .send({ name: "Renamed SQLite Conn", type: "sqlite", filePath: "/tmp/does-not-need-to-exist.sqlite" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.connection.name).toBe("Renamed SQLite Conn");
  });

  it("PUT /:id on an unknown id returns 404", async () => {
    const res = await request(app)
      .put("/api/connections/does-not-exist")
      .send({ name: "x", type: "sqlite", filePath: "/tmp/x.sqlite" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(404);
  });

  it("DELETE /:id removes the connection", async () => {
    const del = await request(app).delete(`/api/connections/${createdId}`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const after = await request(app).get("/api/connections");
    const ids = after.body.connections.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(createdId);
  });

  it("DELETE /:id on an already-deleted id returns 404", async () => {
    const res = await request(app).delete(`/api/connections/${createdId}`);
    expect(res.status).toBe(404);
  });
});
