/**
 * QueryPlayground — Day 5 (query editor + history + export)
 *                  + Day 6 (Builder/SQL toggle, danger-confirm integration)
 *
 * Day 6 changes:
 *  - "Builder | SQL" switch in the toolbar
 *  - <QueryBuilder> panel replaces the CodeMirror editor in Builder mode
 *  - When the backend returns { requiresConfirmation: true } the response
 *    is caught here and wired into the global DangerConfirmModal via the store.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder } from "@codemirror/view";
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands";
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  AlertCircle,
  ChevronRight,
  Clock,
  Code2,
  Download,
  Loader2,
  Play,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { runQuery, fetchHistory, clearHistory, type QueryResult, type HistoryEntry } from "../../api/query";
import { downloadExport, type ExportFormat } from "../../api/exportImport";
import { fetchTableSchema } from "../../api/explorer";
import type { DbType, ColumnInfo } from "../../types";
import type { ExplorerTree } from "../../types";
import { useConnectionStore } from "../../store/connectionStore";

interface QueryPlaygroundProps {
  connectionId: string;
  dbType: DbType;
  activeTable?: string | null;
  explorerTree?: ExplorerTree | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const r = (err as { response?: { data?: { error?: unknown; requiresConfirmation?: boolean } } }).response;
    if (typeof r?.data?.error === "string") return r.data.error;
  }
  return err instanceof Error ? err.message : "Query failed";
}

function isRequiresConfirmation(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "response" in err) {
    const r = (err as { response?: { data?: { requiresConfirmation?: boolean } } }).response;
    return r?.data?.requiresConfirmation === true;
  }
  return false;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="italic text-text-faint">null</span>;
  if (typeof value === "boolean")
    return <span className={`font-mono text-xs ${value ? "text-accent" : "text-text-faint"}`}>{String(value)}</span>;
  if (typeof value === "object")
    return <span className="font-mono text-xs text-text-muted">{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}

// ---------------------------------------------------------------------------
// ResultsGrid
// ---------------------------------------------------------------------------
function ResultsGrid({ result }: { result: QueryResult }) {
  if (result.rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-text-faint">
        Query returned 0 rows.
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col}
                className="border-b border-r border-border px-3 py-2 text-left font-mono text-[11px] uppercase text-text-faint last:border-r-0"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-border hover:bg-surface-raised">
              {result.columns.map((col) => (
                <td key={col} className="max-w-xs truncate border-r border-border-subtle px-3 py-2 text-sm last:border-r-0">
                  <CellValue value={row[col]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryPanel
// ---------------------------------------------------------------------------
function HistoryPanel({
  connectionId,
  onSelect,
  onClose,
}: {
  connectionId: string;
  onSelect: (query: string) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory(connectionId)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [connectionId]);

  async function handleClear() {
    await clearHistory(connectionId);
    setEntries([]);
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[11px] uppercase text-text-faint">History</span>
        <div className="flex items-center gap-1">
          {entries.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear history"
              className="flex h-6 w-6 items-center justify-center rounded text-text-faint hover:bg-surface-raised hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-text-faint hover:bg-surface-raised hover:text-text"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={15} className="animate-spin text-text-muted" />
          </div>
        )}
        {!loading && entries.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-text-faint">No history yet.</p>
        )}
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelect(entry.query)}
            className="group w-full border-b border-border-subtle px-3 py-2.5 text-left hover:bg-surface-raised"
          >
            <p className="truncate font-mono text-xs text-text-muted group-hover:text-text">
              {entry.query}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-text-faint">
              <span>{new Date(entry.executedAt).toLocaleTimeString()}</span>
              <span>·</span>
              <span>{formatMs(entry.executionTimeMs)}</span>
              {entry.error ? (
                <span className="text-danger">error</span>
              ) : (
                <span>{entry.rowCount} rows</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExportDropdown
// ---------------------------------------------------------------------------
function ExportDropdown({
  connectionId,
  table,
}: {
  connectionId: string;
  table: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:border-accent hover:text-accent"
      >
        <Download size={13} />
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-36 rounded-md border border-border bg-canvas py-1 shadow-xl">
          {(["csv", "json", "sql"] as ExportFormat[]).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => { downloadExport(connectionId, table, fmt); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-raised hover:text-text"
            >
              <ChevronRight size={13} className="text-text-faint" />
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QueryBuilder — Day 6 feature
// ---------------------------------------------------------------------------
const SQL_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IS NULL", "IS NOT NULL"] as const;
type SqlOperator = typeof SQL_OPERATORS[number];

interface FilterRow {
  id: number;
  column: string;
  operator: SqlOperator;
  value: string;
}

interface QueryBuilderProps {
  connectionId: string;
  tables: string[];
  onGenerate: (sql: string) => void;
}

function QueryBuilder({ connectionId, tables, onGenerate }: QueryBuilderProps) {
  const [selectedTable, setSelectedTable] = useState(tables[0] ?? "");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loadingCols, setLoadingCols] = useState(false);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const nextId = useRef(1);

  // Load columns when table changes
  useEffect(() => {
    if (!selectedTable || !connectionId) return;
    setLoadingCols(true);
    setColumns([]);
    setSelectedCols(new Set());
    setFilters([]);
    fetchTableSchema(connectionId, selectedTable)
      .then((schema) => {
        setColumns(schema.columns);
        setSelectedCols(new Set(schema.columns.map((c) => c.name)));
      })
      .finally(() => setLoadingCols(false));
  }, [connectionId, selectedTable]);

  function toggleCol(name: string) {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function addFilter() {
    const firstCol = columns[0]?.name ?? "";
    setFilters((f) => [
      ...f,
      { id: nextId.current++, column: firstCol, operator: "=", value: "" },
    ]);
  }

  function removeFilter(id: number) {
    setFilters((f) => f.filter((r) => r.id !== id));
  }

  function updateFilter(id: number, patch: Partial<Omit<FilterRow, "id">>) {
    setFilters((f) => f.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function buildSQL(): string {
    const colList =
      selectedCols.size === 0 || selectedCols.size === columns.length
        ? "*"
        : [...selectedCols].map((c) => `"${c}"`).join(", ");

    const whereParts = filters
      .filter((f) => f.column)
      .map((f) => {
        if (f.operator === "IS NULL" || f.operator === "IS NOT NULL") {
          return `"${f.column}" ${f.operator}`;
        }
        const val = isNaN(Number(f.value)) ? `'${f.value.replace(/'/g, "''")}'` : f.value;
        return `"${f.column}" ${f.operator} ${val}`;
      });

    const where = whereParts.length ? `\nWHERE ${whereParts.join("\n  AND ")}` : "";
    return `SELECT ${colList}\nFROM "${selectedTable}"${where}\nLIMIT 100;`;
  }

  function handleGenerate() {
    const sql = buildSQL();
    onGenerate(sql);
  }

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-5">
      {/* Step 1 — Table */}
      <section>
        <SectionLabel step={1} label="Table" />
        <select
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          {tables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </section>

      {/* Step 2 — Columns */}
      <section>
        <SectionLabel step={2} label="Columns" />
        {loadingCols ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={13} className="animate-spin" /> Loading columns…
          </div>
        ) : columns.length === 0 ? (
          <p className="text-xs text-text-faint">Select a table first.</p>
        ) : (
          <>
            <div className="mb-1.5 flex items-center gap-3">
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => setSelectedCols(new Set(columns.map((c) => c.name)))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-xs text-text-faint hover:underline"
                onClick={() => setSelectedCols(new Set())}
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {columns.map((col) => (
                <label
                  key={col.name}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    selectedCols.has(col.name)
                      ? "border-accent bg-accent/10 text-text"
                      : "border-border-subtle text-text-faint hover:border-border hover:text-text-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedCols.has(col.name)}
                    onChange={() => toggleCol(col.name)}
                  />
                  <span className="font-mono">{col.name}</span>
                  <span className="text-[10px] opacity-60">{col.type}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Step 3 — Filters */}
      <section>
        <SectionLabel step={3} label="Filters" />
        <div className="space-y-2">
          {filters.map((f, idx) => (
            <div key={f.id} className="flex items-center gap-2">
              <span className="w-8 text-right font-mono text-[10px] text-text-faint">
                {idx === 0 ? "WHERE" : "AND"}
              </span>
              {/* Column */}
              <select
                value={f.column}
                onChange={(e) => updateFilter(f.id, { column: e.target.value })}
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              {/* Operator */}
              <select
                value={f.operator}
                onChange={(e) => updateFilter(f.id, { operator: e.target.value as SqlOperator })}
                className="w-32 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
              >
                {SQL_OPERATORS.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              {/* Value */}
              {f.operator !== "IS NULL" && f.operator !== "IS NOT NULL" && (
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                  placeholder="value"
                  className="w-28 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-text placeholder-text-faint focus:border-accent focus:outline-none"
                />
              )}
              <button
                type="button"
                onClick={() => removeFilter(f.id)}
                className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:bg-surface-raised hover:text-danger"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addFilter}
            disabled={columns.length === 0}
            className="text-xs text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add Filter
          </button>
        </div>
      </section>

      {/* Generate */}
      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!selectedTable || columns.length === 0}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-40"
        >
          <Code2 size={14} />
          Generate Query
        </button>
        <p className="mt-2 text-[11px] text-text-faint">
          The generated SQL will appear in the editor. Hit Run to execute it.
        </p>
      </div>
    </div>
  );
}

function SectionLabel({ step, label }: { step: number; label: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-canvas">
        {step}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QueryPlayground (main export)
// ---------------------------------------------------------------------------
export function QueryPlayground({
  connectionId,
  dbType,
  activeTable,
  explorerTree,
}: QueryPlaygroundProps) {
  const isMongo = dbType === "mongodb";
  const setDangerPayload = useConnectionStore((s) => s.setDangerPayload);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const runQueryRef = useRef<() => void>(() => {});

  const [mode, setMode] = useState<"sql" | "builder">("sql");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const getEditorContent = useCallback((): string => {
    return editorViewRef.current?.state.doc.toString() ?? "";
  }, []);

  const setEditorContent = useCallback((text: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
  }, []);

  /** Run the query currently in the editor. Handles danger-confirm flow. */
  const executeQuery = useCallback(async (confirmedOverride = false) => {
    const query = getEditorContent().trim();
    if (!query || running) return;

    setRunning(true);
    setError(null);
    try {
      const res = await runQuery(connectionId, query, confirmedOverride);
      setResult(res);
    } catch (err) {
      if (isRequiresConfirmation(err)) {
        // Show the danger-confirm modal; retry re-runs with confirmed=true
        const message = getErrorMessage(err);
        setDangerPayload({
          message,
          retry: async () => {
            await executeQuery(true);
          },
        });
      } else {
        setError(getErrorMessage(err));
        setResult(null);
      }
    } finally {
      setRunning(false);
    }
  }, [connectionId, getEditorContent, running, setDangerPayload]);

  useEffect(() => { runQueryRef.current = () => executeQuery(false); }, [executeQuery]);

  // Build CodeMirror editor
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const initialDoc = isMongo
      ? `db.${activeTable ?? "collection"}.find({})`
      : activeTable
        ? `SELECT * FROM "${activeTable}" LIMIT 100;`
        : `-- Write your SQL query here\nSELECT 1;`;

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: "Ctrl-Enter",
            mac: "Cmd-Enter",
            run: () => { runQueryRef.current(); return true; },
          },
        ]),
        isMongo ? javascript() : sql(),
        oneDark,
        lineNumbers(),
        highlightActiveLine(),
        placeholder(isMongo ? "db.collection.find({})" : "SELECT * FROM table LIMIT 100;"),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)" },
          ".cm-content": { padding: "12px 0" },
          ".cm-focused": { outline: "none" },
        }),
      ],
    });

    editorViewRef.current = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    return () => {
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, isMongo]);

  const tables = explorerTree?.tables ?? (activeTable ? [activeTable] : []);

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-canvas">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <h1 className="font-display text-sm font-semibold text-text">Query Playground</h1>
        <span className="font-mono text-xs text-text-faint">
          {isMongo ? "MongoDB" : dbType === "sqlite" ? "SQLite" : "PostgreSQL"}
        </span>

        <div className="flex-1" />

        {/* Builder / SQL toggle — only for SQL databases */}
        {!isMongo && (
          <div className="flex items-center rounded-md border border-border-subtle bg-canvas p-0.5">
            <button
              type="button"
              onClick={() => setMode("builder")}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-colors ${
                mode === "builder"
                  ? "bg-accent text-canvas"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <SlidersHorizontal size={12} />
              Builder
            </button>
            <button
              type="button"
              onClick={() => setMode("sql")}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-colors ${
                mode === "sql"
                  ? "bg-accent text-canvas"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Code2 size={12} />
              SQL
            </button>
          </div>
        )}

        {/* History toggle */}
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${
            showHistory
              ? "border-accent text-accent"
              : "border-border-subtle text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          <Clock size={13} />
          History
        </button>

        {/* Export */}
        {result && result.rows.length > 0 && activeTable && (
          <ExportDropdown connectionId={connectionId} table={activeTable} />
        )}

        {/* Run — hidden in builder mode (builder has its own Generate button) */}
        {mode === "sql" && (
          <button
            type="button"
            onClick={() => executeQuery(false)}
            disabled={running}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-50"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Run
            <span className="ml-1 font-mono text-[10px] opacity-60">⌘↵</span>
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Builder panel OR CodeMirror editor */}
          {mode === "builder" && !isMongo ? (
            <div className="h-72 shrink-0 overflow-hidden border-b border-border bg-canvas">
              <QueryBuilder
                connectionId={connectionId}
                tables={tables}
                onGenerate={(sql) => {
                  setEditorContent(sql);
                  setMode("sql"); // switch to SQL view so user can Run
                }}
              />
            </div>
          ) : (
            <div
              ref={editorContainerRef}
              className="h-48 shrink-0 overflow-hidden border-b border-border"
            />
          )}

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span className="font-mono text-xs">{error}</span>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {running && (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  Running query…
                </div>
              </div>
            )}

            {!running && result && (
              <>
                <div className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2">
                  <span className="font-mono text-xs text-text-faint">
                    {result.rowCount.toLocaleString()} row{result.rowCount !== 1 ? "s" : ""}
                  </span>
                  <span className="font-mono text-xs text-text-faint">
                    {formatMs(result.executionTimeMs)}
                  </span>
                  {result.columns.length > 0 && (
                    <span className="font-mono text-xs text-text-faint">
                      {result.columns.length} col{result.columns.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <ResultsGrid result={result} />
              </>
            )}

            {!running && !result && !error && (
              <div className="flex items-center justify-center py-16 text-sm text-text-faint">
                {mode === "builder"
                  ? "Generate a query in the Builder, then switch to SQL and hit Run."
                  : "Run a query to see results."}
              </div>
            )}
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <HistoryPanel
            connectionId={connectionId}
            onSelect={(query) => {
              setEditorContent(query);
              setMode("sql");
              setShowHistory(false);
            }}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </main>
  );
}
