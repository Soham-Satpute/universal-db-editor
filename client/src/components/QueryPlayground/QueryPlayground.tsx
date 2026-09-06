/**
 * QueryPlayground — Day 5 & Day 6 features updated to DESIGN (1).md Uber-inspired design system.
 * Features:
 *  - High-contrast black-and-white duet with sentence-case typography
 *  - Pill-tab segmented mode switch (Builder | SQL) with 36px radius
 *  - Primary black pill Run button
 *  - Subtle pill buttons for AI assistant, history, and exports
 *  - Card-soft-tinted QueryBuilder with column pill chips
 *  - ex-data-table-cell styling for query results grid
 *  - History drawer with app-shell-row entries
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
  MessageSquareText,
  Play,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { runQuery, fetchHistory, clearHistory, type QueryResult, type HistoryEntry } from "../../api/query";
import { downloadExport, type ExportFormat } from "../../api/exportImport";
import { fetchTableSchema } from "../../api/explorer";
import { aiAutocomplete, aiExplain, aiFix } from "../../api/ai";
import type { DbType, ColumnInfo } from "../../types";
import type { ExplorerTree } from "../../types";
import { useConnectionStore } from "../../store/connectionStore";

interface QueryPlaygroundProps {
  connectionId: string;
  dbType: DbType;
  activeTable?: string | null;
  explorerTree?: ExplorerTree | null;
}

function getErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const r = (err as { response?: { data?: { error?: unknown; requiresConfirmation?: boolean } } }).response;
    if (typeof r?.data?.error === "string") return r.data.error;
  }
  return err instanceof Error ? err.message : "Query execution failed";
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

// ---------------------------------------------------------------------------
// ResultsGrid
// ---------------------------------------------------------------------------
function ResultsGrid({ result }: { result: QueryResult }) {
  if (result.rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-mute">
        Query returned 0 rows.
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-canvas-soft border-b border-border">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col}
                className="border-r border-border px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-body last:border-r-0"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-border hover:bg-canvas-soft/60 transition-colors">
              {result.columns.map((col) => (
                <td key={col} className="max-w-xs truncate border-r border-border px-4 py-2 font-mono text-xs text-ink last:border-r-0">
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
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 z-30 bg-black/50 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xs shrink-0 flex-col border-l border-border bg-canvas md:static md:z-auto md:w-80 md:max-w-none">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-mute">Query history</span>
          <div className="flex items-center gap-1">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                title="Clear history"
                className="flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-surface-pressed hover:text-danger transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-surface-pressed hover:text-ink transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && (
            <div className="flex items-center justify-center py-8 text-xs text-body">
              <Loader2 size={14} className="animate-spin text-ink mr-2" /> Loading history…
            </div>
          )}
          {!loading && entries.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-mute">No queries recorded yet.</p>
          )}
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry.query)}
              className="group w-full rounded-xl border border-transparent p-2.5 text-left hover:border-border hover:bg-canvas-soft transition-all"
            >
              <p className="truncate font-mono text-xs text-ink group-hover:text-primary">
                {entry.query}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-body">
                <span>{new Date(entry.executedAt).toLocaleTimeString()}</span>
                <span>·</span>
                <span>{formatMs(entry.executionTimeMs)}</span>
                <span>·</span>
                {entry.error ? (
                  <span className="text-danger font-semibold">Error</span>
                ) : (
                  <span>{entry.rowCount} row{entry.rowCount !== 1 ? "s" : ""}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
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
        className="flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3.5 py-1 text-xs font-medium text-ink hover:bg-canvas-soft transition-colors"
      >
        <Download size={13} />
        <span className="hidden sm:inline">Export</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-36 rounded-2xl border border-border bg-canvas p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
          {(["csv", "json", "sql"] as ExportFormat[]).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => { downloadExport(connectionId, table, fmt); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs font-medium text-ink hover:bg-canvas-soft uppercase transition-colors"
            >
              <ChevronRight size={12} className="text-mute" />
              .{fmt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AiMenu
// ---------------------------------------------------------------------------
interface AiMenuProps {
  busy: "autocomplete" | "explain" | "fix" | null;
  hasError: boolean;
  onAutocomplete: () => void;
  onExplain: () => void;
  onFix: () => void;
}

function AiMenu({ busy, hasError, onAutocomplete, onExplain, onFix }: AiMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isBusy = busy !== null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isBusy}
        className="flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3.5 py-1 text-xs font-medium text-ink hover:bg-canvas-soft disabled:opacity-50 transition-colors"
      >
        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        <span>AI tools</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-48 rounded-2xl border border-border bg-canvas p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
          <button
            type="button"
            onClick={() => { setOpen(false); onAutocomplete(); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink hover:bg-canvas-soft transition-colors"
          >
            <Wand2 size={13} />
            Autocomplete query
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onExplain(); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink hover:bg-canvas-soft transition-colors"
          >
            <MessageSquareText size={13} />
            Explain query
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onFix(); }}
            disabled={!hasError}
            title={hasError ? undefined : "Run a query that errors first"}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            <AlertCircle size={13} />
            Fix query error
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QueryBuilder — Day 6 Visual Query Generator
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
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
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

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-5 bg-canvas">
      {/* Step 1 — Table */}
      <section className="rounded-2xl border border-border bg-canvas-soft p-4">
        <SectionLabel step={1} label="Table" />
        <select
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs font-medium text-ink focus:border-ink focus:outline-none"
        >
          {tables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </section>

      {/* Step 2 — Columns */}
      <section className="rounded-2xl border border-border bg-canvas-soft p-4">
        <div className="flex items-center justify-between">
          <SectionLabel step={2} label="Columns" />
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs font-medium text-ink hover:underline"
              onClick={() => setSelectedCols(new Set(columns.map((c) => c.name)))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs font-medium text-mute hover:underline"
              onClick={() => setSelectedCols(new Set())}
            >
              Clear
            </button>
          </div>
        </div>

        {loadingCols ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-body">
            <Loader2 size={13} className="animate-spin text-ink" /> Loading columns…
          </div>
        ) : columns.length === 0 ? (
          <p className="mt-2 text-xs text-mute">Select a table to display columns.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {columns.map((col) => {
              const isSelected = selectedCols.has(col.name);
              return (
                <button
                  key={col.name}
                  type="button"
                  onClick={() => toggleCol(col.name)}
                  className={`rounded-full px-3 py-1 text-xs font-mono transition-all ${
                    isSelected
                      ? "bg-primary text-on-primary font-medium shadow-sm"
                      : "border border-border bg-canvas text-body hover:bg-surface-pressed"
                  }`}
                >
                  <span>{col.name}</span>
                  <span className="ml-1 opacity-50 text-[10px]">({col.type})</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Step 3 — Filters */}
      <section className="rounded-2xl border border-border bg-canvas-soft p-4">
        <SectionLabel step={3} label="Filters" />
        <div className="mt-2 space-y-2">
          {filters.map((f, idx) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              <span className="w-12 text-right font-mono text-[11px] font-semibold text-body">
                {idx === 0 ? "WHERE" : "AND"}
              </span>
              <select
                value={f.column}
                onChange={(e) => updateFilter(f.id, { column: e.target.value })}
                className="flex-1 rounded-lg border border-border bg-canvas px-3 py-1.5 text-xs text-ink focus:border-ink focus:outline-none"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <select
                value={f.operator}
                onChange={(e) => updateFilter(f.id, { operator: e.target.value as SqlOperator })}
                className="w-28 rounded-lg border border-border bg-canvas px-3 py-1.5 text-xs text-ink focus:border-ink focus:outline-none"
              >
                {SQL_OPERATORS.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              {f.operator !== "IS NULL" && f.operator !== "IS NOT NULL" && (
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                  placeholder="Value"
                  className="w-32 rounded-lg border border-border bg-canvas px-3 py-1.5 font-mono text-xs text-ink placeholder:text-mute focus:border-ink focus:outline-none"
                />
              )}
              <button
                type="button"
                onClick={() => removeFilter(f.id)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-surface-pressed hover:text-danger"
              >
                <X size={13} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addFilter}
            disabled={columns.length === 0}
            className="mt-1 rounded-full border border-border bg-canvas hover:bg-surface-pressed px-3.5 py-1 text-xs font-medium text-ink transition-colors disabled:opacity-40"
          >
            ＋ Add filter
          </button>
        </div>
      </section>

      {/* Step 4 — Generate */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => onGenerate(buildSQL())}
          disabled={!selectedTable || columns.length === 0}
          className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-semibold text-on-primary shadow-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Code2 size={14} />
          Generate query
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
        {step}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider text-ink">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QueryPlayground Component
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
  const executeQueryRef = useRef<(confirmed?: boolean) => Promise<void>>(async () => {});

  const [mode, setMode] = useState<"sql" | "builder">("sql");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [aiBusy, setAiBusy] = useState<"autocomplete" | "explain" | "fix" | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

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
        const message = getErrorMessage(err);
        setDangerPayload({
          message,
          retry: async () => {
            await executeQueryRef.current(true);
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

  useEffect(() => {
    executeQueryRef.current = executeQuery;
    runQueryRef.current = () => executeQuery(false);
  }, [executeQuery]);

  const handleAiAutocomplete = useCallback(async () => {
    const query = getEditorContent();
    if (!query.trim() || aiBusy) return;
    setAiBusy("autocomplete");
    setAiNotice(null);
    try {
      const suggestion = await aiAutocomplete(connectionId, query, activeTable);
      const view = editorViewRef.current;
      if (suggestion && view) {
        const needsSpace = query.length > 0 && !/\s$/.test(query) && !/^\s/.test(suggestion);
        view.dispatch({
          changes: { from: view.state.doc.length, insert: (needsSpace ? " " : "") + suggestion },
        });
      } else if (!suggestion) {
        setAiNotice("No suggestion — try writing a bit more query context first.");
      }
    } catch (err) {
      setAiNotice(getErrorMessage(err));
    } finally {
      setAiBusy(null);
    }
  }, [aiBusy, connectionId, activeTable, getEditorContent]);

  const handleAiExplain = useCallback(async () => {
    const query = getEditorContent();
    if (!query.trim() || aiBusy) return;
    setAiBusy("explain");
    setAiNotice(null);
    try {
      const explanation = await aiExplain(connectionId, query, activeTable);
      setAiNotice(explanation || "No explanation returned.");
    } catch (err) {
      setAiNotice(getErrorMessage(err));
    } finally {
      setAiBusy(null);
    }
  }, [aiBusy, connectionId, activeTable, getEditorContent]);

  const handleAiFix = useCallback(async () => {
    const query = getEditorContent();
    if (!query.trim() || !error || aiBusy) return;
    setAiBusy("fix");
    setAiNotice(null);
    try {
      const { fixedQuery, explanation } = await aiFix(connectionId, query, error, activeTable);
      if (fixedQuery) {
        setEditorContent(fixedQuery);
        setMode("sql");
        setError(null);
      }
      setAiNotice(
        explanation || (fixedQuery ? "Query was fixed — test it now." : "The assistant could not resolve this query."),
      );
    } catch (err) {
      setAiNotice(getErrorMessage(err));
    } finally {
      setAiBusy(null);
    }
  }, [aiBusy, connectionId, activeTable, error, getEditorContent, setEditorContent]);

  // CodeMirror initialization
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const initialDoc = isMongo
      ? `db.${activeTable ?? "collection"}.find({})`
      : activeTable
        ? `SELECT * FROM "${activeTable}" LIMIT 100;`
        : `-- Write your query here\nSELECT 1;`;

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
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-canvas px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-base font-bold text-ink tracking-tight">Query playground</h1>
          <span className="rounded-full bg-canvas-soft px-2.5 py-0.5 font-mono text-xs font-medium text-body">
            {isMongo ? "MongoDB" : dbType === "sqlite" ? "SQLite" : "PostgreSQL"}
          </span>
        </div>

        <div className="hidden flex-1 sm:block" />

        {/* Builder / SQL toggle (36px pill tab) */}
        {!isMongo && (
          <div className="flex items-center gap-1 rounded-[36px] bg-canvas-soft p-1">
            <button
              type="button"
              onClick={() => setMode("builder")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
                mode === "builder"
                  ? "bg-primary text-on-primary shadow-sm font-semibold"
                  : "text-body hover:bg-surface-pressed hover:text-ink"
              }`}
            >
              <SlidersHorizontal size={12} />
              Builder
            </button>
            <button
              type="button"
              onClick={() => setMode("sql")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
                mode === "sql"
                  ? "bg-primary text-on-primary shadow-sm font-semibold"
                  : "text-body hover:bg-surface-pressed hover:text-ink"
              }`}
            >
              <Code2 size={12} />
              SQL
            </button>
          </div>
        )}

        {/* AI tools */}
        <AiMenu
          busy={aiBusy}
          hasError={!!error}
          onAutocomplete={handleAiAutocomplete}
          onExplain={handleAiExplain}
          onFix={handleAiFix}
        />

        {/* History toggle */}
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-medium transition-colors ${
            showHistory
              ? "border-primary bg-primary text-on-primary shadow-sm font-semibold"
              : "border-border bg-canvas text-ink hover:bg-canvas-soft"
          }`}
        >
          <Clock size={13} />
          <span className="hidden sm:inline">History</span>
        </button>

        {/* Export */}
        {result && result.rows.length > 0 && activeTable && (
          <ExportDropdown connectionId={connectionId} table={activeTable} />
        )}

        {/* Run button (primary black pill) */}
        {mode === "sql" && (
          <button
            type="button"
            onClick={() => executeQuery(false)}
            disabled={running}
            className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-1 text-xs font-semibold text-on-primary shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            <span>Run</span>
            <span className="ml-1 hidden font-mono text-[10px] opacity-60 sm:inline">⌘↵</span>
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Query builder panel */}
          {!isMongo && mode === "builder" && (
            <div className="h-80 shrink-0 overflow-y-auto border-b border-border bg-canvas">
              <QueryBuilder
                connectionId={connectionId}
                tables={tables}
                onGenerate={(sql) => {
                  setEditorContent(sql);
                  setMode("sql");
                }}
              />
            </div>
          )}

          {/* CodeMirror editor container — kept permanently in DOM to prevent detachment */}
          <div
            ref={editorContainerRef}
            className={`h-52 shrink-0 overflow-hidden border-b border-border ${
              !isMongo && mode === "builder" ? "hidden" : "block"
            }`}
          />

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 border-b border-danger/30 bg-danger/5 px-4 py-2.5 text-xs text-danger">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="font-mono text-xs">{error}</span>
            </div>
          )}

          {/* AI Notice card */}
          {aiNotice && (
            <div className="m-3 flex items-start gap-3 rounded-2xl border border-border bg-canvas-soft p-3.5 text-xs text-ink shadow-sm">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-ink" />
              <span className="flex-1 whitespace-pre-wrap leading-relaxed font-mono">{aiNotice}</span>
              <button
                type="button"
                onClick={() => setAiNotice(null)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-mute hover:bg-surface-pressed hover:text-ink"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Query Results */}
          <div className="flex-1 overflow-auto bg-canvas">
            {running && (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-2 text-xs text-body">
                  <Loader2 size={16} className="animate-spin text-ink" />
                  Executing query…
                </div>
              </div>
            )}

            {!running && result && (
              <>
                <div className="flex items-center gap-3 border-b border-border bg-canvas-soft px-4 py-2">
                  <span className="font-mono text-xs font-medium text-ink">
                    {result.rowCount.toLocaleString()} row{result.rowCount !== 1 ? "s" : ""}
                  </span>
                  <span className="font-mono text-xs text-mute">·</span>
                  <span className="font-mono text-xs text-body">
                    {formatMs(result.executionTimeMs)}
                  </span>
                  {result.columns.length > 0 && (
                    <>
                      <span className="font-mono text-xs text-mute">·</span>
                      <span className="font-mono text-xs text-body">
                        {result.columns.length} column{result.columns.length !== 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                </div>
                <ResultsGrid result={result} />
              </>
            )}

            {!running && !result && !error && (
              <div className="flex h-full items-center justify-center p-8">
                <div className="w-full max-w-sm rounded-2xl border border-border bg-canvas-soft p-8 text-center">
                  <p className="text-sm font-semibold text-ink">
                    {mode === "builder" ? "Query builder ready" : "Query editor ready"}
                  </p>
                  <p className="mt-1 text-xs text-body">
                    {mode === "builder"
                      ? "Configure your table and filters, generate SQL, and execute."
                      : "Type your query and press Run or ⌘↵ to see results."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History drawer */}
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
