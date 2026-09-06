import { api } from "./client";
import type { IndexInfo } from "../types";

export async function fetchIndexes(
  connectionId: string,
): Promise<{ indexes: IndexInfo[]; supported: boolean }> {
  const { data } = await api.get(`/indexes/${connectionId}`);
  return { indexes: data.indexes ?? [], supported: data.supported ?? false };
}

export async function createIndex(
  connectionId: string,
  table: string,
  columns: string[],
  options?: { unique?: boolean; name?: string },
): Promise<IndexInfo> {
  const { data } = await api.post(`/indexes/${connectionId}`, {
    table,
    columns,
    unique: options?.unique ?? false,
    ...(options?.name ? { name: options.name } : {}),
  });
  return data.index;
}

/**
 * @param table - required for MongoDB (indexes are scoped per collection);
 *   ignored by SQL providers, where index names are already globally unique.
 */
export async function dropIndex(
  connectionId: string,
  name: string,
  table?: string,
): Promise<void> {
  await api.delete(`/indexes/${connectionId}/${encodeURIComponent(name)}`, {
    params: table ? { table } : undefined,
  });
}
