import { api } from "./client";
import type { Connection, DbType } from "../types";

export interface ConnectionFormValues {
  id?: string;
  name: string;
  type: DbType;
  isFavorite: boolean;
  file?: File | null;
  filePath?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  uri?: string;
}

export async function fetchConnections(): Promise<Connection[]> {
  const { data } = await api.get("/connections");
  return data.connections ?? [];
}

export async function saveConnection(values: ConnectionFormValues): Promise<Connection> {
  const formData = new FormData();
  formData.set("name", values.name.trim());
  formData.set("type", values.type);
  formData.set("isFavorite", String(values.isFavorite));

  if (values.type === "sqlite") {
    if (values.file) formData.set("file", values.file);
    if (values.filePath?.trim()) formData.set("filePath", values.filePath.trim());
  }

  if (values.type === "postgresql") {
    if (values.connectionString?.trim()) {
      formData.set("connectionString", values.connectionString.trim());
    } else {
      if (values.host?.trim()) formData.set("host", values.host.trim());
      if (values.port) formData.set("port", String(values.port));
      if (values.database?.trim()) formData.set("database", values.database.trim());
      if (values.user?.trim()) formData.set("user", values.user.trim());
      if (values.password) formData.set("password", values.password);
    }
  }

  if (values.type === "mongodb" && values.uri?.trim()) {
    formData.set("uri", values.uri.trim());
  }

  const { data } = values.id
    ? await api.put(`/connections/${values.id}`, formData)
    : await api.post("/connections", formData);

  return data.connection;
}

export async function deleteConnection(id: string): Promise<void> {
  await api.delete(`/connections/${id}`);
}

export async function toggleFavorite(id: string): Promise<void> {
  await api.patch(`/connections/${id}/favorite`);
}

export async function testConnection(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await api.post(`/connections/${id}/test`);
  return data;
}
