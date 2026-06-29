import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trash2, X } from "lucide-react";
import type { ColumnInfo } from "../../types";
import { insertRow, updateRow, deleteRow } from "../../api/crud";

interface RecordEditorProps {
  connectionId: string;
  table: string;
  columns: ColumnInfo[];
  /** undefined = insert mode, object = edit mode */
  record?: Record<string, unknown>;
  /** The column used as the primary key */
  primaryKey: string;
  onClose: () => void;
  onSaved: () => void;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const r = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof r?.data?.error === "string") return r.data.error;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

function inferInputType(colType: string): string {
  const t = colType.toLowerCase();
  if (t.includes("int") || t.includes("number") || t.includes("numeric") || t.includes("float") || t.includes("double") || t.includes("real") || t.includes("decimal")) return "number";
  if (t.includes("bool")) return "checkbox";
  if (t.includes("date") && !t.includes("time")) return "date";
  if (t.includes("timestamp") || t.includes("datetime")) return "datetime-local";
  return "text";
}

export function RecordEditor({
  connectionId,
  table,
  columns,
  record,
  primaryKey,
  onClose,
  onSaved,
}: RecordEditorProps) {
  const isEdit = record !== undefined;

  // Build initial form state from record or empty
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const col of columns) {
      const val = record?.[col.name];
      initial[col.name] = val !== undefined && val !== null ? String(val) : "";
    }
    return initial;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletePhase, setDeletePhase] = useState<"idle" | "confirm">("idle");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function setValue(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Build payload — exclude empty PK on insert; cast numbers
      const payload: Record<string, unknown> = {};
      for (const col of columns) {
        if (!isEdit && col.isPrimaryKey) continue; // let DB auto-assign PK on insert
        const raw = form[col.name];
        if (raw === "" || raw === undefined) continue;
        const inputType = inferInputType(col.type);
        payload[col.name] = inputType === "number" ? Number(raw) : raw;
      }
      if (isEdit) {
        const pkVal = record![primaryKey];
        await updateRow(connectionId, table, pkVal, payload);
      } else {
        await insertRow(connectionId, table, payload);
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    setError(null);
    try {
      const pkVal = record![primaryKey];
      await deleteRow(connectionId, table, pkVal);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setDeletePhase("idle");
      setDeleteConfirmText("");
    } finally {
      setDeleting(false);
    }
  }

  // Editable columns: on insert, skip auto-increment PKs that have a default; on edit show all
  const editableColumns = columns.filter((col) => {
    if (!isEdit && col.isPrimaryKey && col.defaultValue !== null && col.defaultValue !== undefined) return false;
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-text">
              {isEdit ? "Edit record" : "New record"}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-text-faint">{table}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            {editableColumns.map((col) => {
              const inputType = inferInputType(col.type);
              const isReadonly = isEdit && col.isPrimaryKey;

              return (
                <div key={col.name}>
                  <label className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs font-medium text-text-muted">{col.name}</span>
                    <span className="font-mono text-[10px] text-text-faint">{col.type}</span>
                    {col.isPrimaryKey && (
                      <span className="rounded border border-accent/30 px-1 py-0.5 font-mono text-[9px] uppercase text-accent">pk</span>
                    )}
                    {!col.nullable && !col.isPrimaryKey && (
                      <span className="text-danger" title="Required">*</span>
                    )}
                  </label>

                  {inputType === "checkbox" ? (
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form[col.name] === "true" || form[col.name] === "1"}
                        disabled={isReadonly}
                        onChange={(e) => setValue(col.name, e.target.checked ? "true" : "false")}
                        className="h-4 w-4 rounded border-border accent-accent"
                      />
                      <span className="text-sm text-text-muted">
                        {form[col.name] === "true" || form[col.name] === "1" ? "true" : "false"}
                      </span>
                    </label>
                  ) : (
                    <input
                      type={inputType}
                      value={form[col.name]}
                      readOnly={isReadonly}
                      onChange={(e) => setValue(col.name, e.target.value)}
                      placeholder={col.nullable ? "null" : ""}
                      className={[
                        "w-full rounded-md border px-3 py-2 font-mono text-sm outline-none transition-colors",
                        isReadonly
                          ? "cursor-not-allowed border-border-subtle bg-canvas text-text-faint"
                          : "border-border-subtle bg-canvas text-text placeholder-text-faint focus:border-accent focus:ring-1 focus:ring-accent/30",
                      ].join(" ")}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          {/* Delete zone (edit mode only) */}
          {isEdit && deletePhase === "idle" && (
            <button
              type="button"
              onClick={() => setDeletePhase("confirm")}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}

          {isEdit && deletePhase === "confirm" && (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder='type "DELETE" to confirm'
                className="w-44 rounded-md border border-danger/50 bg-canvas px-2 py-1.5 font-mono text-xs text-danger placeholder-danger/40 focus:outline-none focus:ring-1 focus:ring-danger/40"
              />
              <button
                type="button"
                disabled={deleteConfirmText !== "DELETE" || deleting}
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Confirm
              </button>
              <button
                type="button"
                onClick={() => { setDeletePhase("idle"); setDeleteConfirmText(""); }}
                className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          )}

          {!isEdit && <span />}

          {/* Save / Cancel */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-text-muted hover:bg-surface-raised hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Save changes" : "Insert record"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
