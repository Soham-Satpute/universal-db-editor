import { api } from "./client";

export type ExportFormat = "csv" | "json" | "sql";

/**
 * Triggers a file download by creating a temporary anchor element.
 * The browser handles the save-as dialog.
 */
export function downloadExport(
  connectionId: string,
  table: string,
  format: ExportFormat,
): void {
  const url = `/api/export/${connectionId}/${encodeURIComponent(table)}?format=${format}`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${table}_export.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export interface ImportResult {
  inserted: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

export async function importFile(
  connectionId: string,
  table: string,
  file: File,
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post(
    `/import/${connectionId}/${encodeURIComponent(table)}`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  return {
    inserted: data.inserted ?? 0,
    failed: data.failed ?? 0,
    errors: data.errors ?? [],
  };
}
