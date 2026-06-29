import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { DbType } from "../types";

export interface StoredConnection {
  id: string;
  name: string;
  type: DbType;
  /** AES-256-GCM encrypted JSON of the full ConnectionConfig */
  encryptedConfig: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORE_PATH = join(__dirname, "../../data/connections.json");

function ensureStoreExists(): void {
  const { mkdirSync } = require("fs");
  const dir = join(__dirname, "../../data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify([], null, 2), "utf8");
  }
}

export function readConnections(): StoredConnection[] {
  ensureStoreExists();
  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw) as StoredConnection[];
  } catch {
    return [];
  }
}

export function writeConnections(connections: StoredConnection[]): void {
  ensureStoreExists();
  writeFileSync(STORE_PATH, JSON.stringify(connections, null, 2), "utf8");
}

export function findById(id: string): StoredConnection | undefined {
  return readConnections().find((c) => c.id === id);
}
