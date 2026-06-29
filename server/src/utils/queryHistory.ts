import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface HistoryEntry {
  id: string;
  query: string;
  executedAt: string;
  executionTimeMs: number;
  rowCount: number;
  error?: string;
}

const HISTORY_PATH = join(__dirname, "../../data/queryHistory.json");
const MAX_PER_CONNECTION = 50;

function ensureFile(): void {
  const dir = join(__dirname, "../../data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(HISTORY_PATH)) writeFileSync(HISTORY_PATH, "{}", "utf8");
}

function readAll(): Record<string, HistoryEntry[]> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf8")) as Record<string, HistoryEntry[]>;
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, HistoryEntry[]>): void {
  ensureFile();
  writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function getHistory(connId: string): HistoryEntry[] {
  return readAll()[connId] ?? [];
}

export function appendHistory(connId: string, entry: HistoryEntry): void {
  const all = readAll();
  const entries = all[connId] ?? [];
  // Newest first, cap at MAX_PER_CONNECTION
  all[connId] = [entry, ...entries].slice(0, MAX_PER_CONNECTION);
  writeAll(all);
}

export function clearHistory(connId: string): void {
  const all = readAll();
  delete all[connId];
  writeAll(all);
}
