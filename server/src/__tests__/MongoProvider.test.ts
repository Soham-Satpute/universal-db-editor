import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * MongoProvider talks to a real MongoDB server via the `mongodb` driver.
 * There's no Mongo instance available in the test environment, so the
 * driver's connection classes are mocked here — these are unit tests
 * that verify MongoProvider builds the right filters/options and maps
 * the driver's document shape correctly (including ObjectId handling),
 * not integration tests against a live server. The real `ObjectId` /
 * ObjectId-dependent helpers are kept so id-parsing logic is exercised
 * for real rather than mocked away.
 */
function makeCursor<T>(items: T[]) {
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(items),
  };
  return cursor;
}

function makeCollection() {
  return {
    find: vi.fn().mockReturnValue(makeCursor([])),
    countDocuments: vi.fn().mockResolvedValue(0),
    indexes: vi.fn().mockResolvedValue([]),
    createIndex: vi.fn().mockResolvedValue("some_index_name"),
    dropIndex: vi.fn().mockResolvedValue(undefined),
    insertOne: vi.fn().mockResolvedValue({ insertedId: "x" }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
  };
}

const mockCollections: Record<string, ReturnType<typeof makeCollection>> = {};

function collectionFor(name: string) {
  if (!mockCollections[name]) mockCollections[name] = makeCollection();
  return mockCollections[name];
}

const mockDb = {
  listCollections: vi.fn(),
  collection: vi.fn((name: string) => collectionFor(name)),
};

const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  db: vi.fn(() => mockDb),
};

vi.mock("mongodb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mongodb")>();
  return {
    ...actual,
    MongoClient: vi.fn().mockImplementation(() => mockClient),
  };
});

import { MongoClient, ObjectId } from "mongodb";
import { MongoProvider } from "../providers/MongoProvider";

describe("MongoProvider", () => {
  let provider: MongoProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockCollections)) delete mockCollections[key];
    mockDb.listCollections.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.db.mockReturnValue(mockDb);

    provider = new MongoProvider();
    await provider.connect({ type: "mongodb", uri: "mongodb://localhost:27017/app" });
  });

  it("throws if a method is called before connect()", async () => {
    const fresh = new MongoProvider();
    await expect(fresh.listTables()).rejects.toThrow(/not connected/i);
  });

  it("requires a uri to connect", async () => {
    const fresh = new MongoProvider();
    await expect(fresh.connect({ type: "mongodb" })).rejects.toThrow(/requires uri/i);
  });

  it("connects using the provided uri and opens the default db", async () => {
    expect(MongoClient).toHaveBeenCalledWith("mongodb://localhost:27017/app");
    expect(mockClient.connect).toHaveBeenCalledOnce();
    expect(mockClient.db).toHaveBeenCalledOnce();
  });

  it("disconnect() closes the client and blocks further calls", async () => {
    await provider.disconnect();
    expect(mockClient.close).toHaveBeenCalledOnce();
    await expect(provider.listTables()).rejects.toThrow(/not connected/i);
  });

  it("lists collection names sorted alphabetically", async () => {
    mockDb.listCollections.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ name: "zebras" }, { name: "apples" }]),
    });
    const tables = await provider.listTables();
    expect(tables).toEqual(["apples", "zebras"]);
  });

  describe("listIndexDetails() / listIndexes()", () => {
    it("walks every collection and skips the default _id_ index", async () => {
      mockDb.listCollections.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ name: "users" }, { name: "orders" }]),
      });
      collectionFor("users").indexes.mockResolvedValue([
        { name: "_id_", key: { _id: 1 } },
        { name: "email_1", key: { email: 1 }, unique: true },
      ]);
      collectionFor("orders").indexes.mockResolvedValue([
        { name: "_id_", key: { _id: 1 } },
        { name: "user_id_1", key: { user_id: 1 } },
      ]);

      const details = await provider.listIndexDetails();
      expect(details).toEqual([
        { name: "email_1", table: "users", columns: ["email"], unique: true },
        { name: "user_id_1", table: "orders", columns: ["user_id"], unique: false },
      ]);

      const names = await provider.listIndexes();
      expect(names).toEqual(["email_1", "user_id_1"]);
    });
  });

  describe("createIndex()", () => {
    it("builds an ascending key spec from the given fields and forwards options", async () => {
      const name = await provider.createIndex("users", ["email"], { unique: true, name: "email_1" });
      expect(collectionFor("users").createIndex).toHaveBeenCalledWith(
        { email: 1 },
        { unique: true, name: "email_1" },
      );
      expect(name).toBe("some_index_name");
    });

    it("supports compound indexes across multiple fields", async () => {
      await provider.createIndex("orders", ["user_id", "created_at"]);
      expect(collectionFor("orders").createIndex).toHaveBeenCalledWith(
        { user_id: 1, created_at: 1 },
        { unique: undefined, name: undefined },
      );
    });

    it("rejects an empty field list", async () => {
      await expect(provider.createIndex("users", [])).rejects.toThrow(/at least one field/i);
    });
  });

  describe("dropIndex()", () => {
    it("drops the named index on the given collection", async () => {
      await provider.dropIndex("email_1", "users");
      expect(collectionFor("users").dropIndex).toHaveBeenCalledWith("email_1");
    });

    it("throws when no collection is provided", async () => {
      await expect(provider.dropIndex("email_1")).rejects.toThrow(/requires the collection name/i);
    });
  });

  describe("getSchema()", () => {
    it("infers field types from a sample of documents, flagging _id as the primary key", async () => {
      const oid = new ObjectId();
      collectionFor("users").find.mockReturnValue(
        makeCursor([
          { _id: oid, name: "Ada", tags: ["admin"], lastLogin: new Date(), bio: null },
          { _id: oid, name: "Alan", age: 30 },
        ]),
      );

      const schema = await provider.getSchema("users");
      expect(schema.table).toBe("users");

      const byName = Object.fromEntries(schema.columns.map((c) => [c.name, c]));
      expect(byName._id.isPrimaryKey).toBe(true);
      expect(byName._id.type).toBe("ObjectId");
      expect(byName.name.type).toBe("string");
      expect(byName.tags.type).toBe("Array");
      expect(byName.lastLogin.type).toBe("Date");
      expect(byName.bio.type).toBe("null");
      expect(byName.age.type).toBe("number");
      expect(byName.age.isPrimaryKey).toBe(false);
    });

    it("unions multiple observed types for the same field across sampled documents", async () => {
      collectionFor("mixed").find.mockReturnValue(
        makeCursor([{ value: 1 }, { value: "two" }]),
      );
      const schema = await provider.getSchema("mixed");
      const value = schema.columns.find((c) => c.name === "value");
      expect(value?.type.split(" | ").sort()).toEqual(["number", "string"]);
    });

    it("samples at most 5 documents", async () => {
      const cursor = makeCursor([]);
      collectionFor("users").find.mockReturnValue(cursor);
      await provider.getSchema("users");
      expect(cursor.limit).toHaveBeenCalledWith(5);
    });
  });

  it("query() is not supported for MongoDB", async () => {
    await expect(provider.query("db.users.find()")).rejects.toThrow(/query playground/i);
  });

  describe("findRecords()", () => {
    it("applies default pagination with no filter/sort", async () => {
      const cursor = makeCursor([{ _id: new ObjectId(), name: "Ada" }]);
      collectionFor("users").find.mockReturnValue(cursor);
      collectionFor("users").countDocuments.mockResolvedValue(1);

      const result = await provider.findRecords("users", {});
      expect(collectionFor("users").find).toHaveBeenCalledWith({});
      expect(cursor.sort).toHaveBeenCalledWith([]);
      expect(cursor.skip).toHaveBeenCalledWith(0);
      expect(cursor.limit).toHaveBeenCalledWith(50);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.total).toBe(1);
    });

    it("serializes ObjectId fields on returned documents to hex strings", async () => {
      const oid = new ObjectId();
      collectionFor("users").find.mockReturnValue(makeCursor([{ _id: oid, name: "Ada" }]));
      const result = await provider.findRecords("users", {});
      expect(result.rows[0]._id).toBe(oid.toHexString());
      expect(typeof result.rows[0]._id).toBe("string");
    });

    it("applies filter, sort direction, and pagination together", async () => {
      const cursor = makeCursor([]);
      collectionFor("orders").find.mockReturnValue(cursor);
      collectionFor("orders").countDocuments.mockResolvedValue(0);

      await provider.findRecords("orders", {
        page: 3,
        limit: 20,
        filter: { status: "shipped" },
        sort: { field: "createdAt", direction: "asc" },
      });

      expect(collectionFor("orders").find).toHaveBeenCalledWith({ status: "shipped" });
      expect(cursor.sort).toHaveBeenCalledWith([["createdAt", 1]]);
      expect(cursor.skip).toHaveBeenCalledWith(40); // (page 3 - 1) * limit 20
      expect(cursor.limit).toHaveBeenCalledWith(20);
      expect(collectionFor("orders").countDocuments).toHaveBeenCalledWith({ status: "shipped" });
    });

    it("maps descending sort direction to -1", async () => {
      const cursor = makeCursor([]);
      collectionFor("users").find.mockReturnValue(cursor);
      await provider.findRecords("users", { sort: { field: "name", direction: "desc" } });
      expect(cursor.sort).toHaveBeenCalledWith([["name", -1]]);
    });

    it("clamps limit to a maximum of 100", async () => {
      const cursor = makeCursor([]);
      collectionFor("users").find.mockReturnValue(cursor);
      const result = await provider.findRecords("users", { limit: 1000 });
      expect(result.limit).toBe(100);
      expect(cursor.limit).toHaveBeenCalledWith(100);
    });
  });

  it("insertRecord() delegates to insertOne with the given document", async () => {
    await provider.insertRecord("users", { name: "Ada" });
    expect(collectionFor("users").insertOne).toHaveBeenCalledWith({ name: "Ada" });
  });

  describe("updateRecord()", () => {
    it("parses a valid ObjectId hex string id before filtering", async () => {
      const hex = new ObjectId().toHexString();
      await provider.updateRecord("users", hex, { name: "Updated" });
      const [filter, update] = collectionFor("users").updateOne.mock.calls[0];
      expect(filter._id).toBeInstanceOf(ObjectId);
      expect(filter._id.toHexString()).toBe(hex);
      expect(update).toEqual({ $set: { name: "Updated" } });
    });

    it("leaves a non-ObjectId-shaped id untouched", async () => {
      await provider.updateRecord("counters", "not-an-oid", { value: 2 });
      const [filter] = collectionFor("counters").updateOne.mock.calls[0];
      expect(filter._id).toBe("not-an-oid");
    });
  });

  describe("deleteRecord()", () => {
    it("parses a valid ObjectId hex string id before deleting", async () => {
      const hex = new ObjectId().toHexString();
      await provider.deleteRecord("users", hex);
      const [filter] = collectionFor("users").deleteOne.mock.calls[0];
      expect(filter._id).toBeInstanceOf(ObjectId);
    });

    it("leaves a non-ObjectId-shaped id untouched", async () => {
      await provider.deleteRecord("counters", 42);
      const [filter] = collectionFor("counters").deleteOne.mock.calls[0];
      expect(filter._id).toBe(42);
    });
  });
});
