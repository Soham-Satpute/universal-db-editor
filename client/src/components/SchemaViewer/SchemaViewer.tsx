import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { AlertCircle, Copy, Loader2, Check } from "lucide-react";
import { fetchTableSchema } from "../../api/explorer";
import type { ColumnInfo, SchemaInfo } from "../../types";

interface SchemaViewerProps {
  connectionId: string;
  table: string;
  dbType: string;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const r = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof r?.data?.error === "string") return r.data.error;
  }
  return error instanceof Error ? error.message : "Failed to load schema";
}

function buildDDL(schema: SchemaInfo): string {
  const cols = schema.columns
    .map((col) => {
      const parts = [`  "${col.name}" ${col.type.toUpperCase()}`];
      if (col.isPrimaryKey) parts.push("PRIMARY KEY");
      if (!col.nullable && !col.isPrimaryKey) parts.push("NOT NULL");
      if (col.defaultValue !== null && col.defaultValue !== undefined)
        parts.push(`DEFAULT ${col.defaultValue}`);
      return parts.join(" ");
    })
    .join(",\n");
  return `CREATE TABLE "${schema.table}" (\n${cols}\n);`;
}

function MongoSchemaTable({ columns }: { columns: ColumnInfo[] }) {
  return (
    <div className="overflow-auto p-4">
      <div className="rounded-2xl border border-border overflow-hidden bg-canvas">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-canvas-soft border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-body">Field</th>
              <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-body">Inferred type</th>
              <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-body">Constraint</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.name} className="border-b border-border last:border-b-0 hover:bg-canvas-soft/60 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-ink font-medium">
                  {col.name}
                  {col.isPrimaryKey && (
                    <span className="ml-2 rounded-full bg-primary px-1.5 py-0.2 text-[9px] uppercase font-semibold text-on-primary">pk</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-body">{col.type}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-mute">
                  {col.nullable === false ? "required" : "optional"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DDLViewer({ ddl }: { ddl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: ddl,
      extensions: [
        sql(),
        oneDark,
        lineNumbers(),
        highlightActiveLine(),
        EditorView.editable.of(false),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)" },
          ".cm-content": { padding: "16px 0" },
        }),
      ],
    });

    viewRef.current = new EditorView({ state, parent: containerRef.current });
    return () => { viewRef.current?.destroy(); viewRef.current = null; };
  }, [ddl]);

  async function handleCopy() {
    await navigator.clipboard.writeText(ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-canvas">
        <div className="flex items-center justify-between border-b border-border bg-canvas-soft px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-mute">DDL statement</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3.5 py-1 text-xs font-medium text-ink hover:bg-surface-pressed transition-colors"
          >
            {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      </div>
    </div>
  );
}

export function SchemaViewer({ connectionId, table, dbType }: SchemaViewerProps) {
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSchema(null);
    setLoading(true);
    setError(null);

    fetchTableSchema(connectionId, table)
      .then(setSchema)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [connectionId, table]);

  const isMongo = dbType === "mongodb";

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-canvas">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-canvas px-4 py-3">
        <h1 className="font-display text-base font-bold text-ink tracking-tight">{table}</h1>
        <span className="rounded-full bg-canvas-soft px-2.5 py-0.5 font-mono text-xs font-medium text-body">
          {isMongo ? "Collection schema" : "Table schema"}
        </span>
        {schema && (
          <span className="rounded-full bg-canvas-soft px-2.5 py-0.5 font-mono text-xs font-medium text-body">
            {schema.columns.length} {isMongo ? "fields" : "columns"}
          </span>
        )}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-body">
            <Loader2 size={16} className="animate-spin text-ink" />
            Loading schema…
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="m-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 text-xs text-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {!loading && schema && (
        isMongo
          ? <MongoSchemaTable columns={schema.columns} />
          : <DDLViewer ddl={buildDDL(schema)} />
      )}
    </main>
  );
}
