import { api } from "./client";
import type { SchemaInfo } from "../types";

export interface PaginatedResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

export interface FetchRowsOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
}

export async function fetchRows(
  connectionId: string,
  table: string,
  options: FetchRowsOptions = {},
): Promise<PaginatedResult> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.sort) params.set("sort", options.sort);
  if (options.order) params.set("order", options.order);
  if (options.search?.trim()) params.set("search", options.search.trim());

  const { data } = await api.get(
    `/crud/${connectionId}/${encodeURIComponent(table)}?${params.toString()}`,
  );
  return {
    rows: data.rows ?? [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    limit: data.limit ?? 50,
  };
}

export async function insertRow(
  connectionId: string,
  table: string,
  record: Record<string, unknown>,
): Promise<void> {
  await api.post(`/crud/${connectionId}/${encodeURIComponent(table)}`, record);
}

export async function updateRow(
  connectionId: string,
  table: string,
  id: unknown,
  record: Record<string, unknown>,
): Promise<void> {
  await api.put(`/crud/${connectionId}/${encodeURIComponent(table)}/${id}`, record);
}

export async function deleteRow(
  connectionId: string,
  table: string,
  id: unknown,
): Promise<void> {
  await api.delete(`/crud/${connectionId}/${encodeURIComponent(table)}/${id}`, {
    data: { confirmed: true },
  });
}

export async function fetchSchema(connectionId: string, table: string): Promise<SchemaInfo> {
  const { data } = await api.get(
    `/explorer/${connectionId}/schema/${encodeURIComponent(table)}`,
  );
  return data.schema;
}
