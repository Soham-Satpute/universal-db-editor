import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Folder,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { fetchExplorerTree, fetchTableSchema } from "../../api/explorer";
import { fetchIndexes, createIndex, dropIndex } from "../../api/indexes";
import { useConnectionStore } from "../../store/connectionStore";
import type { ColumnInfo, ExplorerTree, IndexInfo } from "../../types";

interface DatabaseTreeProps {
  onError: (message: string) => void;
  nested?: boolean;
}

type SectionKey = "tables" | "views";

const sectionMeta: Record<SectionKey, { label: string; Icon: typeof Folder }> = {
  tables: { label: "Tables", Icon: Folder },
  views: { label: "Views", Icon: Folder },
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === "string") return response.data.error;
  }
  return error instanceof Error ? error.message : "Failed to load database tree";
}

export function DatabaseTree({ onError, nested = false }: DatabaseTreeProps) {
  const connections = useConnectionStore((s) => s.connections);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeTable = useConnectionStore((s) => s.activeTable);
  const setActiveTable = useConnectionStore((s) => s.setActiveTable);
  const setExplorerTree = useConnectionStore((s) => s.setExplorerTree);
  const setDangerPayload = useConnectionStore((s) => s.setDangerPayload);

  const [tree, setTree] = useState<ExplorerTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    tables: true,
    views: true,
  });

  const activeConnection = useMemo(
    () => connections.find((connection) => connection.id === activeConnectionId),
    [activeConnectionId, connections],
  );
  const isMongo = activeConnection?.type === "mongodb";

  useEffect(() => {
    if (!activeConnectionId) {
      setTree(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetchExplorerTree(activeConnectionId)
      .then((nextTree) => {
        setTree(nextTree);
        setExplorerTree(nextTree);
      })
      .catch((err) => {
        const message = getErrorMessage(err);
        setError(message);
        setTree(null);
        onError(message);
      })
      .finally(() => setLoading(false));
  }, [activeConnectionId, onError, setExplorerTree]);

  if (!activeConnectionId) {
    return null;
  }

  return (
    <div className={nested ? "pb-2 pt-1" : "border-t border-border px-3 py-3"}>
      {!nested && (
        <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-mute">
          <Database size={13} />
          Explorer
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 rounded-xl px-2 py-2.5 text-xs text-body">
          <Loader2 size={13} className="animate-spin text-ink" />
          Loading explorer tree…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* MongoDB collections list */}
      {!loading && tree && isMongo && (
        <div className="space-y-1">
          {tree.tables.length === 0 ? (
            <p className="px-2 py-2 text-xs text-mute">No collections found</p>
          ) : (
            tree.tables.map((collection) => (
              <TreeLeaf
                key={collection}
                label={collection}
                active={activeTable === collection}
                onClick={() => setActiveTable(collection)}
              />
            ))
          )}
        </div>
      )}

      {/* SQL tables, views, and indexes */}
      {!loading && tree && !isMongo && (
        <div className="space-y-1">
          {(["tables", "views"] as SectionKey[]).map((section) => {
            const items = tree[section];
            const { Icon, label } = sectionMeta[section];
            const isOpen = openSections[section];

            return (
              <div key={section}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
                  }
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-medium text-body hover:bg-canvas-soft hover:text-ink transition-colors"
                >
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <Icon size={13} className="text-mute" />
                  <span className="flex-1">{label}</span>
                  <span className="rounded-full bg-canvas-soft px-2 py-0.2 font-mono text-[10px] text-body">
                    {items.length}
                  </span>
                </button>
                {isOpen && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-border pl-2">
                    {items.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-mute">Empty</p>
                    ) : (
                      items.map((item) => (
                        <TreeLeaf
                          key={`${section}-${item}`}
                          label={item}
                          active={section === "tables" && activeTable === item}
                          disabled={section !== "tables"}
                          onClick={() => section === "tables" && setActiveTable(item)}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <IndexesSection
            connectionId={activeConnectionId}
            tables={tree.tables}
            isMongo={isMongo}
            setDangerPayload={setDangerPayload}
          />
        </div>
      )}

      {/* MongoDB indexes */}
      {!loading && tree && isMongo && (
        <div className="mt-1 space-y-1">
          <IndexesSection
            connectionId={activeConnectionId}
            tables={tree.tables}
            isMongo={isMongo}
            setDangerPayload={setDangerPayload}
          />
        </div>
      )}
    </div>
  );
}

function TreeLeaf({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl py-1.5 pl-2.5 pr-2 text-left text-xs transition-all ${
        active
          ? "bg-canvas-soft font-semibold text-ink border-l-4 border-primary"
          : disabled
            ? "cursor-default text-mute"
            : "text-body hover:bg-canvas-soft hover:text-ink"
      }`}
    >
      <FileText size={13} className={active ? "text-ink" : "text-mute"} />
      <span className="truncate">{label}</span>
    </button>
  );
}

interface DangerPayload {
  message: string;
  retry: () => Promise<void>;
}

function IndexesSection({
  connectionId,
  tables,
  isMongo,
  setDangerPayload,
}: {
  connectionId: string;
  tables: string[];
  isMongo: boolean;
  setDangerPayload: (payload: DangerPayload | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    if (!connectionId) return;
    setLoading(true);
    setError(null);
    fetchIndexes(connectionId)
      .then(({ indexes: list, supported: isSupported }) => {
        setIndexes(list);
        setSupported(isSupported);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [connectionId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function handleDelete(idx: IndexInfo) {
    setDangerPayload({
      message: `Drop index "${idx.name}" on ${idx.table} (${idx.columns.join(", ")})? This action cannot be undone.`,
      retry: async () => {
        await dropIndex(connectionId, idx.name, isMongo ? idx.table : undefined);
        setIndexes((prev) => prev.filter((i) => i.name !== idx.name));
      },
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-medium text-body hover:bg-canvas-soft hover:text-ink transition-colors"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <KeyRound size={13} className="text-mute" />
        <span className="flex-1">Indexes</span>
        {!loading && open && (
          <span className="rounded-full bg-canvas-soft px-2 py-0.2 font-mono text-[10px] text-body">
            {indexes.length}
          </span>
        )}
      </button>

      {open && (
        <div className="ml-3 mt-1 space-y-1.5 border-l border-border pl-2">
          {loading && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-body">
              <Loader2 size={12} className="animate-spin text-ink" />
              Loading indexes…
            </div>
          )}

          {!loading && error && <p className="px-2 py-1 text-xs text-danger">{error}</p>}

          {!loading && !error && !supported && (
            <p className="px-2 py-1 text-xs text-mute">Not supported for this database.</p>
          )}

          {!loading && !error && supported && indexes.length === 0 && (
            <p className="px-2 py-1 text-xs text-mute">No indexes yet.</p>
          )}

          {!loading &&
            !error &&
            indexes.map((idx) => (
              <div
                key={`${idx.table}.${idx.name}`}
                className="group flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-canvas-soft transition-colors"
              >
                <KeyRound size={13} className="mt-0.5 shrink-0 text-mute" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-xs font-medium text-ink">{idx.name}</span>
                    {idx.unique && (
                      <span className="shrink-0 rounded-full bg-surface-pressed px-1.5 py-0.2 text-[9px] font-semibold uppercase text-ink">
                        unique
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-body">
                    {idx.table}.{idx.columns.join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(idx)}
                  title="Drop index"
                  className="mt-0.5 shrink-0 text-mute opacity-0 hover:text-danger group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

          {supported &&
            (showForm ? (
              <CreateIndexForm
                connectionId={connectionId}
                tables={tables}
                onCreated={(idx) => {
                  setIndexes((prev) => [...prev, idx]);
                  setShowForm(false);
                }}
                onCancel={() => setShowForm(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                disabled={tables.length === 0}
                className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-ink hover:bg-canvas-soft transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={12} />
                New index
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function CreateIndexForm({
  connectionId,
  tables,
  onCreated,
  onCancel,
}: {
  connectionId: string;
  tables: string[];
  onCreated: (idx: IndexInfo) => void;
  onCancel: () => void;
}) {
  const [table, setTable] = useState(tables[0] ?? "");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loadingCols, setLoadingCols] = useState(false);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [unique, setUnique] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!table || !connectionId) return;
    setLoadingCols(true);
    setColumns([]);
    setSelectedCols(new Set());
    fetchTableSchema(connectionId, table)
      .then((schema) => setColumns(schema.columns))
      .catch(() => setColumns([]))
      .finally(() => setLoadingCols(false));
  }, [connectionId, table]);

  function toggleCol(colName: string) {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) {
        next.delete(colName);
      } else {
        next.add(colName);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (!table || selectedCols.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const idx = await createIndex(connectionId, table, [...selectedCols], {
        unique,
        name: name.trim() || undefined,
      });
      onCreated(idx);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-canvas-soft p-3">
      <select
        value={table}
        onChange={(e) => setTable(e.target.value)}
        className="w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-xs text-ink focus:border-ink focus:outline-none"
      >
        {tables.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {loadingCols ? (
        <div className="flex items-center gap-2 text-[11px] text-body">
          <Loader2 size={12} className="animate-spin text-ink" />
          Loading columns…
        </div>
      ) : columns.length === 0 ? (
        <p className="text-[11px] text-mute">No columns found for this table.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {columns.map((col) => (
            <button
              key={col.name}
              type="button"
              onClick={() => toggleCol(col.name)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-mono transition-colors ${
                selectedCols.has(col.name)
                  ? "bg-primary text-on-primary font-medium shadow-sm"
                  : "border border-border bg-canvas text-body hover:bg-surface-pressed"
              }`}
            >
              {col.name}
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={table ? `idx_${table}_... (optional)` : "Index name (optional)"}
        className="w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 font-mono text-[11px] text-ink placeholder:text-mute focus:border-ink focus:outline-none"
      />

      <label className="flex items-center gap-2 text-xs font-medium text-ink">
        <input
          type="checkbox"
          checked={unique}
          onChange={(e) => setUnique(e.target.checked)}
          className="rounded border-border text-primary focus:ring-0"
        />
        Unique index
      </label>

      {error && <p className="text-[11px] text-danger">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!table || selectedCols.size === 0 || saving}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-on-primary shadow-sm hover:opacity-90 disabled:opacity-40"
        >
          {saving && <Loader2 size={11} className="animate-spin" />}
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full bg-canvas border border-border px-3 py-1 text-xs font-medium text-body hover:bg-surface-pressed"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
