import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Edit3,
  FileArchive,
  Leaf,
  Loader2,
  MoreVertical,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Server,
  Star,
  Trash2,
} from "lucide-react";
import {
  deleteConnection,
  fetchConnections,
  saveConnection,
  testConnection,
  toggleFavorite,
  type ConnectionFormValues,
} from "../../api/connections";
import { downloadFullExport } from "../../api/exportImport";
import { useConnectionStore } from "../../store/connectionStore";
import type { Connection, DbType } from "../../types";
import { ConnectionForm } from "./ConnectionForm";
import { DatabaseTree } from "./DatabaseTree";
import { Toast } from "../Toast";
import { useToast } from "../../hooks/useToast";

const dbMeta: Record<DbType, { label: string; Icon: typeof Database }> = {
  sqlite: { label: "SQLite", Icon: FileArchive },
  postgresql: { label: "PostgreSQL", Icon: Server },
  mongodb: { label: "MongoDB", Icon: Leaf },
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    const apiError = response?.data?.error;
    if (typeof apiError === "string") return apiError;
    if (apiError) return "Request failed validation";
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

export function Sidebar() {
  const connections = useConnectionStore((s) => s.connections);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const setConnections = useConnectionStore((s) => s.setConnections);
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection);
  const sidebarOpen = useConnectionStore((s) => s.sidebarOpen);
  const setSidebarOpen = useConnectionStore((s) => s.setSidebarOpen);
  const sidebarCollapsed = useConnectionStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapse = useConnectionStore((s) => s.toggleSidebarCollapse);

  const [loading, setLoading] = useState(true);
  const [modalConnection, setModalConnection] = useState<Connection | null | undefined>();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToast();

  const activeConnection = useMemo(
    () => connections.find((connection) => connection.id === activeConnectionId),
    [activeConnectionId, connections],
  );

  const handleTreeError = useCallback(
    (message: string) => showToast({ kind: "error", message }),
    [showToast],
  );

  async function reloadConnections() {
    const nextConnections = await fetchConnections();
    setConnections(nextConnections);
  }

  useEffect(() => {
    reloadConnections()
      .catch((error) => showToast({ kind: "error", message: getErrorMessage(error) }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(values: ConnectionFormValues) {
    try {
      const saved = await saveConnection(values);
      await reloadConnections();
      setActiveConnection(saved.id);
      setModalConnection(undefined);
      showToast({ kind: "success", message: "Connection saved" });
    } catch (error) {
      showToast({ kind: "error", message: getErrorMessage(error) });
      throw error;
    }
  }

  async function handleDelete(connection: Connection) {
    const confirmed = window.confirm(`Delete "${connection.name}"?`);
    if (!confirmed) return;

    setBusyId(connection.id);
    try {
      await deleteConnection(connection.id);
      await reloadConnections();
      if (activeConnectionId === connection.id) setActiveConnection(null);
      showToast({ kind: "success", message: "Connection deleted" });
    } catch (error) {
      showToast({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  async function handleToggleFavorite(connection: Connection) {
    setBusyId(connection.id);
    try {
      await toggleFavorite(connection.id);
      await reloadConnections();
    } catch (error) {
      showToast({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(connectionId: string) {
    setBusyId(connectionId);
    try {
      const result = await testConnection(connectionId);
      showToast({
        kind: result.ok ? "success" : "error",
        message: result.ok ? "Connection test passed" : result.error ?? "Connection test failed",
      });
    } catch (error) {
      showToast({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  function handleExportDatabase(connectionId: string, format: "sql" | "json") {
    downloadFullExport(connectionId, format);
    setOpenMenuId(null);
  }

  return (
    <>
      {/* Backdrop for mobile drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-14 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col border-r border-border bg-canvas transition-all duration-200 ease-in-out md:static md:inset-auto md:shrink-0 ${
          sidebarOpen ? "translate-x-0 w-80 max-w-[85vw]" : "-translate-x-full w-80 max-w-[85vw]"
        } ${
          sidebarCollapsed
            ? "md:translate-x-0 md:w-0 md:border-r-0 md:opacity-0 md:pointer-events-none md:overflow-hidden"
            : "md:translate-x-0 md:w-80 md:opacity-100 md:pointer-events-auto"
        }`}
      >
        <div className="flex h-full w-80 min-w-[20rem] flex-col overflow-hidden">
          {/* Header section with add button and collapse button */}
          <div className="border-b border-border px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-mute">
                Connections
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setModalConnection(null)}
                  title="Add connection"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary hover:opacity-90 transition-opacity"
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  onClick={toggleSidebarCollapse}
                  title="Collapse sidebar (Ctrl+B)"
                  aria-label="Collapse sidebar"
                  className="hidden md:flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-surface-pressed hover:text-ink transition-colors"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>
            </div>

          {/* Active connection card (card-soft-tinted) */}
          <div className="mt-3 rounded-2xl border border-border bg-canvas-soft p-3">
            {activeConnection ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{activeConnection.name}</p>
                  <p className="text-xs text-body">
                    {dbMeta[activeConnection.type].label}
                  </p>
                </div>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-on-primary uppercase tracking-wide">
                  Active
                </span>
              </div>
            ) : (
              <p className="text-xs text-body">No active connection</p>
            )}
          </div>
        </div>

        {/* Connection List */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-4 text-xs text-body">
              <Loader2 size={15} className="animate-spin text-ink" />
              Loading connections…
            </div>
          ) : connections.length === 0 ? (
            <div className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-canvas-soft/40 px-4 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-canvas border border-border-subtle text-body">
                <Database size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">No connections yet</p>
                <p className="mt-1 text-xs text-body">
                  Add one to get started
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {connections.map((connection) => {
                const { Icon, label } = dbMeta[connection.type];
                const isActive = connection.id === activeConnectionId;
                const isBusy = busyId === connection.id;

                return (
                  <li key={connection.id} className="relative">
                    {/* ex-app-shell-row: active state has left indicator bar */}
                    <button
                      type="button"
                      onClick={() => setActiveConnection(isActive ? null : connection.id)}
                      aria-expanded={isActive}
                      className={`grid w-full grid-cols-[auto_auto_1fr_auto] items-center gap-2.5 rounded-xl border-l-4 py-2.5 pl-2.5 pr-14 text-left transition-all ${
                        isActive
                          ? "border-primary bg-canvas-soft text-ink font-medium"
                          : "border-transparent text-body hover:bg-canvas-soft hover:text-ink"
                      }`}
                    >
                      {isActive ? (
                        <ChevronDown size={14} className="text-ink" />
                      ) : (
                        <ChevronRight size={14} className="text-mute" />
                      )}
                      <Icon size={16} className={isActive ? "text-ink" : "text-body"} />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-ink">
                          {connection.name}
                        </span>
                        <span className="block text-[11px] text-body">{label}</span>
                      </span>
                      {isBusy && (
                        <Loader2 size={14} className="animate-spin text-ink" />
                      )}
                    </button>

                    {/* Actions: Favorite & Kebab */}
                    <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
                      <button
                        type="button"
                        title="Toggle favorite"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleFavorite(connection);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-surface-pressed hover:text-ink transition-colors"
                      >
                        <Star
                          size={13}
                          className={connection.isFavorite ? "fill-primary text-primary" : ""}
                        />
                      </button>
                      <button
                        type="button"
                        title="Connection actions"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId(openMenuId === connection.id ? null : connection.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-surface-pressed hover:text-ink transition-colors"
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>

                    {/* Kebab Dropdown Menu (card-elevated) */}
                    {openMenuId === connection.id && (
                      <div className="absolute right-2.5 top-10 z-20 w-52 rounded-2xl border border-border bg-canvas p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                        <button
                          type="button"
                          onClick={() => {
                            setModalConnection(connection);
                            setOpenMenuId(null);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink hover:bg-canvas-soft transition-colors"
                        >
                          <Edit3 size={13} />
                          Edit connection
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTest(connection.id)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink hover:bg-canvas-soft transition-colors"
                        >
                          <RefreshCw size={13} />
                          Test connection
                        </button>
                        <div className="my-1 border-t border-border" />
                        <button
                          type="button"
                          onClick={() => handleExportDatabase(connection.id, "sql")}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink hover:bg-canvas-soft transition-colors"
                        >
                          <Download size={13} />
                          Export database (.sql)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportDatabase(connection.id, "json")}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink hover:bg-canvas-soft transition-colors"
                        >
                          <Download size={13} />
                          Export database (.json)
                        </button>
                        <div className="my-1 border-t border-border" />
                        <button
                          type="button"
                          onClick={() => handleDelete(connection)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 size={13} />
                          Delete connection
                        </button>
                      </div>
                    )}

                    {/* Inline tree under active connection */}
                    {isActive && (
                      <div className="ml-3 mt-1.5 border-l-2 border-border pl-2">
                        <DatabaseTree nested onError={handleTreeError} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </div>

        {modalConnection !== undefined && (
          <ConnectionForm
            connection={modalConnection}
            onClose={() => setModalConnection(undefined)}
            onSave={handleSave}
            onTest={handleTest}
          />
        )}
      </aside>

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
