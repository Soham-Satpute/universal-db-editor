import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileArchive,
  Leaf,
  Loader2,
  Server,
  Star,
  X,
} from "lucide-react";
import type { Connection, DbType } from "../../types";
import type { ConnectionFormValues } from "../../api/connections";
import { getErrorMessage } from "../../utils/error";

interface ConnectionFormProps {
  connection?: Connection | null;
  onClose: () => void;
  onSave: (values: ConnectionFormValues) => Promise<void>;
  onTest?: (id: string) => Promise<void>;
}

const dbTypes: Array<{ type: DbType; label: string; Icon: typeof Database }> = [
  { type: "sqlite", label: "SQLite", Icon: FileArchive },
  { type: "postgresql", label: "PostgreSQL", Icon: Server },
  { type: "mongodb", label: "MongoDB", Icon: Leaf },
];

const POSTGRES_URI_PATTERN = /^postgres(?:ql)?:\/\/\S+$/i;

function looksLikePostgresConnectionString(value: string): boolean {
  return POSTGRES_URI_PATTERN.test(value.trim());
}

export function ConnectionForm({ connection, onClose, onSave, onTest }: ConnectionFormProps) {
  const initial = useMemo<ConnectionFormValues>(
    () => ({
      id: connection?.id,
      name: connection?.name ?? "",
      type: connection?.type ?? "sqlite",
      isFavorite: connection?.isFavorite ?? false,
      filePath: connection?.config?.filePath ?? "",
      host: connection?.config?.host ?? "localhost",
      port: connection?.config?.port ?? 5432,
      database: connection?.config?.database ?? "",
      user: connection?.config?.user ?? "",
      password: "",
      connectionString: connection?.config?.connectionString ?? "",
      uri: connection?.config?.uri ?? "",
    }),
    [connection],
  );

  const [values, setValues] = useState<ConnectionFormValues>(initial);
  const [useConnectionString, setUseConnectionString] = useState(
    Boolean(initial.connectionString),
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <Key extends keyof ConnectionFormValues>(
    key: Key,
    value: ConnectionFormValues[Key],
  ) => {
    setError(null);
    setValues((current) => ({ ...current, [key]: value }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({
        ...values,
        connectionString: useConnectionString ? values.connectionString : "",
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!connection?.id || !onTest) return;
    setError(null);
    setTesting(true);
    try {
      await onTest(connection.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ex-modal-card: 16px radius, Level 2 drop shadow */}
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-ink">
              {connection ? "Edit connection" : "New connection"}
            </h2>
            <p className="mt-0.5 text-xs text-body">
              Credentials are encrypted at rest on the server.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas-soft text-body hover:bg-surface-pressed hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {/* Inline Error Alert */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span className="flex-1 font-medium leading-relaxed">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 text-danger hover:opacity-75 transition-opacity"
                aria-label="Dismiss error"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Name and Favorite */}
          <div>
            <label htmlFor="connection-name" className="block text-xs font-semibold uppercase tracking-wider text-mute">
              Name
            </label>
            <div className="mt-1.5 flex items-center gap-2.5">
              <input
                id="connection-name"
                required
                value={values.name}
                onChange={(event) => setField("name", event.target.value)}
                className="h-10 flex-1 rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all placeholder:text-mute focus:border-ink focus:bg-canvas"
                placeholder="Production analytics"
              />
              <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-canvas-soft px-4 text-xs font-medium text-ink transition-colors hover:bg-surface-pressed select-none">
                <input
                  type="checkbox"
                  checked={values.isFavorite}
                  onChange={(event) => setField("isFavorite", event.target.checked)}
                  className="sr-only"
                />
                <Star
                  size={14}
                  className={values.isFavorite ? "fill-primary text-primary" : "text-mute"}
                />
                <span>Favorite</span>
              </label>
            </div>
          </div>

          {/* Database Type Segmented Pill */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-mute">Database type</span>
            <div className="mt-1.5 flex gap-1 rounded-[36px] bg-canvas-soft p-1">
              {dbTypes.map(({ type, label, Icon }) => {
                const isSelected = values.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setField("type", type)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-body hover:bg-surface-pressed hover:text-ink"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SQLite Form Fields */}
          {values.type === "sqlite" && (
            <div className="space-y-3.5 pt-1">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-mute">Upload SQLite database</span>
                <div className="mt-1.5 flex items-center rounded-lg border border-border bg-canvas-soft p-2.5">
                  <input
                    type="file"
                    accept=".sqlite,.sqlite3,.db"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setField("file", event.target.files?.[0] ?? null)
                    }
                    className="w-full text-xs text-body file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-on-primary hover:file:opacity-90"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-mute">Or specify file path</span>
                <input
                  value={values.filePath ?? ""}
                  onChange={(event) => setField("filePath", event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all placeholder:text-mute focus:border-ink focus:bg-canvas"
                  placeholder="C:\data\analytics.db"
                />
              </label>
            </div>
          )}

          {/* PostgreSQL Form Fields */}
          {values.type === "postgresql" && (
            <div className="space-y-3.5 pt-1">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-canvas-soft px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-pressed">
                <input
                  type="checkbox"
                  checked={useConnectionString}
                  onChange={(event) => setUseConnectionString(event.target.checked)}
                  className="rounded border-border text-primary focus:ring-0"
                />
                Use connection string
              </label>

              {useConnectionString ? (
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mute">Connection string</span>
                  <input
                    value={values.connectionString ?? ""}
                    onChange={(event) => setField("connectionString", event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all placeholder:text-mute focus:border-ink focus:bg-canvas"
                    placeholder="postgresql://user:password@localhost:5432/database"
                  />
                </label>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <label className="block flex-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-mute">Host</span>
                      <input
                        value={values.host ?? ""}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          if (looksLikePostgresConnectionString(nextValue)) {
                            setField("connectionString", nextValue.trim());
                            setUseConnectionString(true);
                            return;
                          }
                          setField("host", nextValue);
                        }}
                        className="mt-1.5 h-10 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all placeholder:text-mute focus:border-ink focus:bg-canvas"
                        placeholder="localhost"
                      />
                    </label>

                    <label className="block w-24 shrink-0">
                      <span className="text-xs font-semibold uppercase tracking-wider text-mute">Port</span>
                      <input
                        type="number"
                        value={values.port ?? 5432}
                        onChange={(event) => setField("port", Number(event.target.value))}
                        className="mt-1.5 h-10 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all focus:border-ink focus:bg-canvas"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wider text-mute">Database name</span>
                    <input
                      value={values.database ?? ""}
                      onChange={(event) => setField("database", event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all placeholder:text-mute focus:border-ink focus:bg-canvas"
                      placeholder="postgres"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-mute">User</span>
                      <input
                        value={values.user ?? ""}
                        onChange={(event) => setField("user", event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all placeholder:text-mute focus:border-ink focus:bg-canvas"
                        placeholder="postgres"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-mute">Password</span>
                      <input
                        type="password"
                        value={values.password ?? ""}
                        onChange={(event) => setField("password", event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all focus:border-ink focus:bg-canvas"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MongoDB Form Fields */}
          {values.type === "mongodb" && (
            <div className="pt-1">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-mute">MongoDB URI</span>
                <input
                  value={values.uri ?? ""}
                  onChange={(event) => setField("uri", event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 text-sm text-ink outline-none transition-all placeholder:text-mute focus:border-ink focus:bg-canvas"
                  placeholder="mongodb://localhost:27017/analytics"
                />
              </label>
            </div>
          )}
        </div>

        {/* Action Buttons: Pill Hierarchy */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-canvas px-6 py-4">
          <button
            type="button"
            onClick={handleTest}
            disabled={!connection?.id || testing}
            className="flex h-9 items-center gap-2 rounded-full border border-border bg-canvas px-4 text-xs font-medium text-ink transition-colors hover:bg-canvas-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            <span>Test connection</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-full bg-canvas-soft px-4 text-xs font-medium text-body hover:bg-surface-pressed hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-full bg-primary px-6 text-xs font-semibold text-on-primary shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save connection
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
