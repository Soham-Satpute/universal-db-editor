import { api } from "./client";

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

export interface HistoryEntry {
  id: string;
  query: string;
  executedAt: string;
  executionTimeMs: number;
  rowCount: number;
  error?: string;
}

/**
 * Run a query against the connected database.
 * @param confirmed - set to true when re-submitting after the user has
 *   confirmed a dangerous operation in the DangerConfirmModal. The backend
 *   queryGuard allows the request through when confirmed === true.
 */
export async function runQuery(
  connectionId: string,
  query: string,
  confirmed = false,
): Promise<QueryResult> {
  const { data } = await api.post(`/query/${connectionId}`, {
    query,
    ...(confirmed ? { confirmed: true } : {}),
  });
  return {
    columns: data.columns ?? [],
    rows: data.rows ?? [],
    rowCount: data.rowCount ?? 0,
    executionTimeMs: data.executionTimeMs ?? 0,
  };
}

export async function fetchHistory(connectionId: string): Promise<HistoryEntry[]> {
  const { data } = await api.get(`/query/${connectionId}/history`);
  return data.history ?? [];
}

export async function clearHistory(connectionId: string): Promise<void> {
  await api.delete(`/query/${connectionId}/history`);
}
