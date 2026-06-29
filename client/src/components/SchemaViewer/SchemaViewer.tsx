import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { AlertCircle, Copy, Loader2 } from "lucide-react";
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

/** Generate a CREATE TABLE DDL string from SchemaInfo */
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

/** Render a MongoDB-style inferred field list */
function MongoSchemaTable({ columns }: { columns: ColumnInfo[] }) {
  return (
    <div className="overflow-auto p-4">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-2 pr-6 text-left font-mono text-[11px] uppercase text-text-faint">Field</th>
            <th className="pb-2 pr-6 text-left font-mono text-[11px] uppercase text-text-faint">Inferred type</th>
            <th className="pb-2 text-left font-mono text-[11px] uppercase text-text-faint">Notes</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col.name} className="border-b border-border-subtle hover:bg-surface-raised">
              <td className="py-2 pr-6 font-mono text-sm text-text">
                {col.name}
                {col.isPrimaryKey && (
                  <span className="ml-2 rounded border border-accent/30 px-1 py-0.5 text-[9px] uppercase text-accent">pk</span>
                )}
              </td>
              <td className="py-2 pr-6 font-mono text-sm text-text-muted">{col.type}</td>
              <td className="py-2 text-xs text-text-faint">
                {col.nullable === false ? "required" : "optional"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Read-only CodeMirror DDL viewer */
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
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <span className="font-mono text-[11px] uppercase text-text-faint">DDL</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-text-muted hover:bg-surface-raised hover:text-text"
        >
          <Copy size={13} />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
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
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <h1 className="font-display text-sm font-semibold text-text">{table}</h1>
        <span className="font-mono text-xs text-text-faint">
          {isMongo ? "collection schema" : "table schema"}
        </span>
        {schema && (
          <span className="font-mono text-xs text-text-faint">
            · {schema.columns.length} {isMongo ? "fields" : "columns"}
          </span>
        )}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={16} className="animate-spin" />
            Loading schema…
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="m-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-3 text-sm text-danger">
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
