import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database,
  Edit3,
  FileArchive,
  Leaf,
  Loader2,
  MoreVertical,
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
import { useConnectionStore } from "../../store/connectionStore";
import type { Connection, DbType } from "../../types";
import { ConnectionForm } from "./ConnectionForm";
import { DatabaseTree } from "./DatabaseTree";
import { Toast, useToast } from "../Toast";

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

  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on tap */}
      {sidebarOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-12 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-x-0 bottom-0 top-12 z-40 flex w-80 max-w-[85vw] -translate-x-full flex-col border-r border-border bg-surface transition-transform duration-200 md:static md:inset-auto md:w-80 md:max-w-none md:shrink-0 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : ""
        }`}
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium uppercase text-text-faint">
              Connections
            </span>
            <button
              type="button"
              onClick={() => setModalConnection(null)}
              title="Add connection"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-text-muted hover:border-accent hover:text-accent"
            >
              <Plus size={15} />
            </button>
          </div>

          <div className="mt-3 min-h-10 rounded-md border border-border-subtle bg-canvas px-3 py-2">
            {activeConnection ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{activeConnection.name}</p>
                  <p className="mt-0.5 text-xs text-text-faint">
                    {dbMeta[activeConnection.type].label}
                  </p>
                </div>
                <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent">
                  active
                </span>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No active connection</p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin" />
              Loading connections
            </div>
          ) : connections.length === 0 ? (
            <div className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-subtle px-4 py-10 text-center">
              <Database size={20} className="text-text-faint" />
              <div>
                <p className="text-sm text-text-muted">No connections yet</p>
                <p className="mt-1 font-mono text-xs text-text-faint">
                  add one to get started
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-1">
              {connections.map((connection) => {
                const { Icon, label } = dbMeta[connection.type];
                const isActive = connection.id === activeConnectionId;
                const isBusy = busyId === connection.id;

                return (
                  <li key={connection.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveConnection(connection.id)}
                      className={`grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-md border px-2 py-2 text-left ${
                        isActive
                          ? "border-accent/60 bg-accent-soft"
                          : "border-transparent hover:border-border-subtle hover:bg-surface-raised"
                      }`}
                    >
                      <Icon size={16} className={isActive ? "text-accent" : "text-text-faint"} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text">
                          {connection.name}
                        </span>
                        <span className="block text-xs text-text-faint">{label}</span>
                      </span>
                      {isBusy ? (
                        <Loader2 size={15} className="animate-spin text-text-muted" />
                      ) : (
                        <span className="h-4 w-4" />
                      )}
                    </button>

                    <div className="absolute right-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        title="Toggle favorite"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleFavorite(connection);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-text-faint hover:bg-canvas hover:text-accent"
                      >
                        <Star
                          size={14}
                          className={connection.isFavorite ? "fill-accent text-accent" : ""}
                        />
                      </button>
                      <button
                        type="button"
                        title="Connection actions"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId(openMenuId === connection.id ? null : connection.id);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-text-faint hover:bg-canvas hover:text-text"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>

                    {openMenuId === connection.id && (
                      <div className="absolute right-2 top-9 z-10 w-36 rounded-md border border-border bg-canvas py-1 shadow-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setModalConnection(connection);
                            setOpenMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-raised hover:text-text"
                        >
                          <Edit3 size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTest(connection.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-raised hover:text-text"
                        >
                          <RefreshCw size={14} />
                          Reconnect
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(connection)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface-raised"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DatabaseTree onError={handleTreeError} />

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
