import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { fetchRows, fetchSchema, type FetchRowsOptions } from "../../api/crud";
import { importFile, downloadExport, type ExportFormat } from "../../api/exportImport";
import type { ColumnInfo, SchemaInfo } from "../../types";
import { RecordEditor } from "../RecordEditor/RecordEditor";
import { Toast, useToast } from "../Toast";

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
    return <span className="italic text-text-faint">null</span>;
  if (typeof value === "boolean")
    return (
      <span className={`font-mono text-xs ${value ? "text-accent" : "text-text-faint"}`}>
        {String(value)}
      </span>
    );
  if (typeof value === "object")
    return <span className="font-mono text-xs text-text-muted">{JSON.stringify(value)}</span>;
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
        className="flex h-7 items-center gap-1.5 rounded-md border border-border-subtle px-2.5 text-xs text-text-muted hover:border-accent hover:text-accent"
      >
        <Download size={13} />
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-32 rounded-md border border-border bg-canvas py-1 shadow-xl">
          {(["csv", "json", "sql"] as ExportFormat[]).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => handleExport(fmt)}
              className="w-full px-3 py-2 text-left font-mono text-xs text-text-muted hover:bg-surface-raised hover:text-text"
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

  // Modal state: null=closed, undefined=insert, object=edit
  const [editorRecord, setEditorRecord] = useState<Record<string, unknown> | undefined | null>(null);

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
      .catch(() => { /* schema is optional */ });
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
    if (sort !== field) return <ChevronsUpDown size={13} className="opacity-30" />;
    return order === "asc"
      ? <ChevronUp size={13} className="text-accent" />
      : <ChevronDown size={13} className="text-accent" />;
  }

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, total);

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-canvas">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <h1 className="font-display text-sm font-semibold text-text">{table}</h1>
        {total > 0 && (
          <span className="font-mono text-xs text-text-faint">{total.toLocaleString()} rows</span>
        )}

        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-52">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-md border border-border-subtle bg-canvas py-1.5 pl-8 pr-7 font-mono text-xs text-text placeholder-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint hover:text-text"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={loadRows}
          disabled={loading}
          title="Refresh"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-text-muted hover:border-accent hover:text-accent disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
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
            className="flex h-7 items-center gap-1.5 rounded-md border border-border-subtle px-2.5 text-xs text-text-muted hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Import
          </button>
        </>

        {/* Add row */}
        {schema && (
          <button
            type="button"
            onClick={() => setEditorRecord(undefined)}
            className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-canvas hover:opacity-90"
          >
            <Plus size={13} />
            Add row
          </button>
        )}
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Table area */}
      <div className="relative flex-1 overflow-auto">
        {loading && rows.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin" />
              Loading rows…
            </div>
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-text-muted">
                {debouncedSearch ? "No rows match your search." : "This table is empty."}
              </p>
              {debouncedSearch && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-2 text-xs text-accent hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className="border-b border-r border-border px-3 py-2.5 text-left font-medium last:border-r-0"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.name)}
                      className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-text-faint hover:text-text"
                    >
                      {col.name}
                      {col.isPrimaryKey && (
                        <span className="rounded border border-accent/30 px-0.5 text-[9px] uppercase text-accent">pk</span>
                      )}
                      <SortIcon field={col.name} />
                    </button>
                  </th>
                ))}
                <th className="border-b border-border px-3 py-2.5 text-left">
                  <span className="font-mono text-[11px] uppercase text-text-faint">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="group border-b border-border-subtle hover:bg-surface-raised">
                  {columns.map((col) => (
                    <td
                      key={col.name}
                      className="max-w-xs truncate border-r border-border-subtle px-3 py-2 last:border-r-0"
                    >
                      <CellValue value={row[col.name]} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setEditorRecord(row)}
                      className="rounded px-2 py-0.5 font-mono text-[11px] text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface hover:text-accent"
                    >
                      edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {loading && rows.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/50">
            <Loader2 size={20} className="animate-spin text-accent" />
          </div>
        )}
      </div>

      {/* Pagination bar */}
      {(rows.length > 0 || total > 0) && (
        <div className="flex items-center justify-between border-t border-border bg-surface px-4 py-2">
          <span className="font-mono text-xs text-text-faint">
            {total > 0 ? `${startRow}–${endRow} of ${total.toLocaleString()}` : "0 rows"}
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="rounded px-2 py-1 text-xs text-text-muted hover:text-text disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="font-mono text-xs text-text-muted">{page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded px-2 py-1 text-xs text-text-muted hover:text-text disabled:opacity-30"
            >
              Next →
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-faint">rows per page</span>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="rounded border border-border-subtle bg-canvas px-2 py-1 font-mono text-xs text-text-muted focus:border-accent focus:outline-none"
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
          onClose={() => setEditorRecord(null)}
          onSaved={() => { setEditorRecord(null); loadRows(); }}
        />
      )}
    </main>
  );
}
