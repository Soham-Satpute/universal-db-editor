import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { fetchRows, fetchSchema, type FetchRowsOptions } from "../../api/crud";
import { importFile, downloadExport, type ExportFormat } from "../../api/exportImport";
import type { ColumnInfo, SchemaInfo } from "../../types";
import { RecordEditor } from "../RecordEditor/RecordEditor";
import { Toast } from "../Toast";
import { useToast } from "../../hooks/useToast";

interface DataGridProps {
  connectionId: string;
  table: string;
}

const PAGE_SIZES = [25, 50, 100];

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const r = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof r?.data?.error === "string") return r.data.error;
  }
  return error instanceof Error ? error.message : "Failed to load data";
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="italic text-mute">null</span>;
  if (typeof value === "boolean")
    return (
      <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${value ? "bg-primary text-on-primary" : "bg-surface-pressed text-body"}`}>
        {String(value)}
      </span>
    );
  if (typeof value === "object")
    return <span className="font-mono text-xs text-body">{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}

function ExportDropdown({ connectionId, table }: { connectionId: string; table: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleExport(fmt: ExportFormat) {
    downloadExport(connectionId, table, fmt);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-canvas px-3.5 text-xs font-medium text-ink hover:bg-canvas-soft transition-colors"
      >
        <Download size={13} />
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-36 rounded-2xl border border-border bg-canvas p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
          {(["csv", "json", "sql"] as ExportFormat[]).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => handleExport(fmt)}
              className="w-full rounded-xl px-3 py-1.5 text-left font-mono text-xs font-medium text-ink hover:bg-canvas-soft transition-colors uppercase"
            >
              .{fmt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DataGrid({ connectionId, table }: DataGridProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<string | undefined>();
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { toast, showToast, dismissToast } = useToast();

  // Modal state
  const [editorRecord, setEditorRecord] = useState<Record<string, unknown> | undefined | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const primaryKey = useMemo(() => {
    if (!schema) return "id";
    const pk = schema.columns.find((c) => c.isPrimaryKey);
    return pk?.name ?? (schema.table.startsWith("_") ? "_id" : "id");
  }, [schema]);

  // Load schema once per table
  useEffect(() => {
    setSchema(null);
    setRows([]);
    setTotal(0);
    setPage(1);
    setSort(undefined);
    setSearch("");
    setDebouncedSearch("");
    setError(null);

    fetchSchema(connectionId, table)
      .then(setSchema)
      .catch(() => { /* schema optional */ });
  }, [connectionId, table]);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const options: FetchRowsOptions = { page, limit };
      if (sort) { options.sort = sort; options.order = order; }
      if (debouncedSearch) options.search = debouncedSearch;
      const result = await fetchRows(connectionId, table, options);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [connectionId, table, page, limit, sort, order, debouncedSearch]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // Import handler
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setImporting(true);
    dismissToast();

    try {
      const result = await importFile(connectionId, table, file);
      const msg = result.failed > 0
        ? `Inserted ${result.inserted}, failed ${result.failed}`
        : `Inserted ${result.inserted} row${result.inserted !== 1 ? "s" : ""}`;
      showToast({ kind: result.failed === 0 ? "success" : "error", message: msg });
      await loadRows();
    } catch (err) {
      showToast({ kind: "error", message: getErrorMessage(err) });
    } finally {
      setImporting(false);
    }
  }

  const columns: ColumnInfo[] = useMemo(() => {
    if (schema?.columns.length) return schema.columns;
    if (rows.length) return Object.keys(rows[0]).map((name) => ({ name, type: "unknown" }));
    return [];
  }, [schema, rows]);

  function handleSort(field: string) {
    if (sort === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("asc");
    }
    setPage(1);
  }

  function SortIcon({ field }: { field: string }) {
    if (sort !== field) return <ChevronsUpDown size={13} className="text-mute opacity-40" />;
    return order === "asc"
      ? <ChevronUp size={13} className="text-ink" />
      : <ChevronDown size={13} className="text-ink" />;
  }

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, total);

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-canvas">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-canvas px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-base font-bold text-ink tracking-tight">{table}</h1>
          {total > 0 && (
            <span className="rounded-full bg-canvas-soft px-2.5 py-0.5 font-mono text-xs font-medium text-body">
              {total.toLocaleString()} rows
            </span>
          )}
        </div>

        <div className="hidden flex-1 sm:block" />

        {/* Search */}
        <div className="relative order-last w-full sm:order-none sm:w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records…"
            className="w-full rounded-full border border-transparent bg-canvas-soft py-1.5 pl-8 pr-8 text-xs text-ink placeholder:text-mute focus:border-ink focus:bg-canvas outline-none transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          {/* Refresh */}
          <button
            type="button"
            onClick={loadRows}
            disabled={loading}
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas-soft text-ink hover:bg-surface-pressed disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>

          {/* Export */}
          <ExportDropdown connectionId={connectionId} table={table} />

          {/* Import */}
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
              className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-canvas px-3.5 text-xs font-medium text-ink hover:bg-canvas-soft disabled:opacity-40 transition-colors"
            >
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              <span>Import</span>
            </button>
          </>

          {/* Add row */}
          {schema && (
            <button
              type="button"
              onClick={() => setEditorRecord(undefined)}
              className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary shadow-sm hover:opacity-90 transition-opacity"
            >
              <Plus size={13} />
              <span>Add row</span>
            </button>
          )}
        </div>
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 border-b border-danger/30 bg-danger/5 px-4 py-2.5 text-xs text-danger">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Data Table with ex-data-table-cell styling */}
      <div className="relative flex-1 overflow-auto">
        {loading && rows.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-body">
              <Loader2 size={15} className="animate-spin text-ink" />
              Loading rows…
            </div>
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-canvas-soft p-8 text-center">
              <p className="text-sm font-semibold text-ink">
                {debouncedSearch ? "No rows match your search" : "This table is empty"}
              </p>
              <p className="mt-1 text-xs text-body">
                {debouncedSearch ? "Try adjusting your query filter." : "Click 'Add row' or 'Import' to populate data."}
              </p>
              {debouncedSearch && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-4 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:opacity-90 transition-opacity"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-canvas-soft border-b border-border">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className="border-r border-border px-4 py-3 text-left font-semibold text-ink last:border-r-0"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.name)}
                      className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-body hover:text-ink transition-colors"
                    >
                      {col.name}
                      {col.isPrimaryKey && (
                        <span className="rounded-full bg-primary px-1.5 py-0.2 text-[9px] uppercase font-semibold text-on-primary">
                          pk
                        </span>
                      )}
                      <SortIcon field={col.name} />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-semibold text-ink">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-body">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="group border-b border-border transition-colors hover:bg-canvas-soft/60">
                  {columns.map((col) => (
                    <td
                      key={col.name}
                      className="max-w-xs truncate border-r border-border px-4 py-2.5 font-mono text-xs text-ink last:border-r-0"
                    >
                      <CellValue value={row[col.name]} />
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setDeleteMode(false); setEditorRecord(row); }}
                        title="Edit row"
                        className="flex items-center gap-1 rounded-full bg-canvas-soft hover:bg-surface-pressed px-2.5 py-1 text-[11px] font-medium text-ink transition-colors"
                      >
                        <Pencil size={11} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeleteMode(true); setEditorRecord(row); }}
                        title="Delete row"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-mute hover:bg-danger/10 hover:text-danger transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {loading && rows.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/40 backdrop-blur-[1px]">
            <Loader2 size={20} className="animate-spin text-ink" />
          </div>
        )}
      </div>

      {/* Pagination bar */}
      {(rows.length > 0 || total > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-canvas px-4 py-2.5">
          <span className="font-mono text-xs text-body">
            {total > 0 ? `${startRow}–${endRow} of ${total.toLocaleString()}` : "0 rows"}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-full border border-border bg-canvas hover:bg-canvas-soft px-3.5 py-1 text-xs font-medium text-ink disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <span className="font-mono text-xs font-medium text-ink px-2">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-border bg-canvas hover:bg-canvas-soft px-3.5 py-1 text-xs font-medium text-ink disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-body hidden sm:inline">Per page:</span>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="rounded-full border border-border bg-canvas-soft px-3 py-1 font-mono text-xs text-ink focus:outline-none"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Record editor modal */}
      {editorRecord !== null && schema && (
        <RecordEditor
          connectionId={connectionId}
          table={table}
          columns={columns}
          record={editorRecord}
          primaryKey={primaryKey}
          startInDeletePhase={deleteMode}
          onClose={() => { setEditorRecord(null); setDeleteMode(false); }}
          onSaved={() => { setEditorRecord(null); setDeleteMode(false); loadRows(); }}
        />
      )}
    </main>
  );
}
