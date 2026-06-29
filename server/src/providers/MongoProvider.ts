import { Db, Document, Filter, MongoClient, ObjectId, Sort } from "mongodb";
import { BaseProvider } from "./BaseProvider";
import {
  ConnectionConfig,
  PaginatedResult,
  QueryOptions,
  QueryResult,
  SchemaInfo,
} from "../types";

function normalizePagination(options: QueryOptions): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(options.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 50)));
  return { page, limit, skip: (page - 1) * limit };
}

function inferValueType(value: unknown): string {
  if (value instanceof ObjectId) return "ObjectId";
  if (value instanceof Date) return "Date";
  if (Array.isArray(value)) return "Array";
  if (value === null) return "null";
  return typeof value;
}

function serializeDocument(document: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(document).map(([key, value]) => [
      key,
      value instanceof ObjectId ? value.toHexString() : value,
    ]),
  );
}

function parseId(id: unknown): unknown {
  return typeof id === "string" && ObjectId.isValid(id) ? new ObjectId(id) : id;
}

export class MongoProvider extends BaseProvider {
  private client?: MongoClient;
  private db?: Db;

  async connect(config: ConnectionConfig): Promise<void> {
    if (!config.uri) {
      throw new Error("MongoDB connection requires uri");
    }
    this.client = new MongoClient(config.uri);
    await this.client.connect();
    this.db = this.client.db();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.db = undefined;
    this.connected = false;
  }

  async listTables(): Promise<string[]> {
    this.assertConnected();
    const collections = await this.db!.listCollections().toArray();
    return collections.map((collection) => collection.name).sort((a, b) => a.localeCompare(b));
  }

  async getSchema(table: string): Promise<SchemaInfo> {
    this.assertConnected();
    const sample = await this.db!.collection(table).find({}).limit(5).toArray();
    const typeMap = new Map<string, Set<string>>();

    for (const document of sample) {
      for (const [field, value] of Object.entries(document)) {
        if (!typeMap.has(field)) typeMap.set(field, new Set<string>());
        typeMap.get(field)!.add(inferValueType(value));
      }
    }

    return {
      table,
      columns: Array.from(typeMap.entries()).map(([name, types]) => ({
        name,
        type: Array.from(types).join(" | "),
        nullable: false,
        isPrimaryKey: name === "_id",
      })),
    };
  }

  async query(_sql: string, _params?: unknown[]): Promise<QueryResult> {
    throw new Error("Mongo query execution is implemented in the query playground on Day 5");
  }

  async findRecords(table: string, options: QueryOptions): Promise<PaginatedResult> {
    this.assertConnected();
    const { page, limit, skip } = normalizePagination(options);
    const filter = (options.filter ?? {}) as Filter<Document>;
    const sort: Sort = options.sort
      ? [[options.sort.field, options.sort.direction === "asc" ? 1 : -1]]
      : [];
    const collection = this.db!.collection(table);
    const [rows, total] = await Promise.all([
      collection.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);

    return {
      rows: rows.map((row) => serializeDocument(row as Record<string, unknown>)),
      total,
      page,
      limit,
    };
  }

  async insertRecord(table: string, data: Record<string, unknown>): Promise<void> {
    this.assertConnected();
    await this.db!.collection(table).insertOne(data);
  }

  async updateRecord(table: string, id: unknown, data: Record<string, unknown>): Promise<void> {
    this.assertConnected();
    await this.db!
      .collection(table)
      .updateOne({ _id: parseId(id) } as Filter<Document>, { $set: data });
  }

  async deleteRecord(table: string, id: unknown): Promise<void> {
    this.assertConnected();
    await this.db!.collection(table).deleteOne({ _id: parseId(id) } as Filter<Document>);
  }
}
