import { api } from "./client";
import type { ExplorerTree, SchemaInfo } from "../types";

export async function fetchExplorerTree(connectionId: string): Promise<ExplorerTree> {
  const { data } = await api.get(`/explorer/${connectionId}/tables`);
  return {
    tables: data.tables ?? [],
    views: data.views ?? [],
    indexes: data.indexes ?? [],
  };
}

export async function fetchTableSchema(
  connectionId: string,
  table: string,
): Promise<SchemaInfo> {
  const { data } = await api.get(
    `/explorer/${connectionId}/schema/${encodeURIComponent(table)}`,
  );
  return data.schema;
}

export interface ForeignKeyRelationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  constraintName?: string;
}

export async function fetchRelationships(
  connectionId: string,
): Promise<ForeignKeyRelationship[]> {
  const { data } = await api.get(`/explorer/${connectionId}/relationships`);
  return data.relationships ?? [];
}
