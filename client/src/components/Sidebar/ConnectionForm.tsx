import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
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

  const setField = <Key extends keyof ConnectionFormValues>(
    key: Key,
    value: ConnectionFormValues[Key],
  ) => setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...values,
        connectionString: useConnectionString ? values.connectionString : "",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!connection?.id || !onTest) return;
    setTesting(true);
    try {
      await onTest(connection.id);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-text">
              {connection ? "Edit connection" : "New connection"}
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Credentials are stored encrypted on the server.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised hover:text-text"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="text-xs font-medium uppercase text-text-faint">Name</span>
              <input
                required
                value={values.name}
                onChange={(event) => setField("name", event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                placeholder="Local analytics"
              />
            </label>

            <label className="mt-5 flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={values.isFavorite}
                onChange={(event) => setField("isFavorite", event.target.checked)}
                className="accent-accent"
              />
              <Star size={15} className={values.isFavorite ? "fill-accent text-accent" : ""} />
              Favorite
            </label>
          </div>

          <div>
            <span className="text-xs font-medium uppercase text-text-faint">Database type</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {dbTypes.map(({ type, label, Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setField("type", type)}
                  className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm ${
                    values.type === type
                      ? "border-accent bg-accent-soft text-text"
                      : "border-border bg-canvas text-text-muted hover:border-border hover:bg-surface-raised"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {values.type === "sqlite" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium uppercase text-text-faint">Upload file</span>
                <input
                  type="file"
                  accept=".sqlite,.sqlite3,.db"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setField("file", event.target.files?.[0] ?? null)
                  }
                  className="mt-1 block w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-muted file:mr-3 file:rounded file:border-0 file:bg-accent-soft file:px-3 file:py-1 file:text-text"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase text-text-faint">File path</span>
                <input
                  value={values.filePath ?? ""}
                  onChange={(event) => setField("filePath", event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                  placeholder="C:\\data\\app.db"
                />
              </label>
            </div>
          )}

          {values.type === "postgresql" && (
            <div className="space-y-4">
              <label className="flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-muted">
                <input
                  type="checkbox"
                  checked={useConnectionString}
                  onChange={(event) => setUseConnectionString(event.target.checked)}
                  className="accent-accent"
                />
                Use connection string
              </label>

              {useConnectionString ? (
                <label className="block">
                  <span className="text-xs font-medium uppercase text-text-faint">
                    Connection string
                  </span>
                  <input
                    value={values.connectionString ?? ""}
                    onChange={(event) => setField("connectionString", event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                    placeholder="postgresql://user:password@localhost:5432/dbname"
                  />
                </label>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-text-faint">Host</span>
                    <input
                      value={values.host ?? ""}
                      onChange={(event) => setField("host", event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-text-faint">Port</span>
                    <input
                      type="number"
                      value={values.port ?? 5432}
                      onChange={(event) => setField("port", Number(event.target.value))}
                      className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-text-faint">Database</span>
                    <input
                      value={values.database ?? ""}
                      onChange={(event) => setField("database", event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-text-faint">User</span>
                    <input
                      value={values.user ?? ""}
                      onChange={(event) => setField("user", event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium uppercase text-text-faint">Password</span>
                    <input
                      type="password"
                      value={values.password ?? ""}
                      onChange={(event) => setField("password", event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {values.type === "mongodb" && (
            <label className="block">
              <span className="text-xs font-medium uppercase text-text-faint">MongoDB URI</span>
              <input
                value={values.uri ?? ""}
                onChange={(event) => setField("uri", event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-accent"
                placeholder="mongodb://localhost:27017/app"
              />
            </label>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handleTest}
            disabled={!connection?.id || testing}
            className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-text-muted hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Test Connection
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md px-3 text-sm text-text-muted hover:bg-surface-raised"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-canvas disabled:opacity-70"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
