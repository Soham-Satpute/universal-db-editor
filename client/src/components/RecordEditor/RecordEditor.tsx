import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  /** Opens directly on the delete-confirmation step (edit mode only) */
  startInDeletePhase?: boolean;
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
  startInDeletePhase = false,
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
  const [deletePhase, setDeletePhase] = useState<"idle" | "confirm">(
    isEdit && startInDeletePhase ? "confirm" : "idle",
  );
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
      const payload: Record<string, unknown> = {};
      for (const col of columns) {
        if (!isEdit && col.isPrimaryKey) continue;
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

  const editableColumns = columns.filter((col) => {
    if (!isEdit && col.isPrimaryKey && col.defaultValue !== null && col.defaultValue !== undefined) return false;
    return true;
  });

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              {isEdit ? "Edit record" : "New record"}
            </h2>
            <p className="font-mono text-xs text-body">{table}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas-soft text-body hover:bg-surface-pressed hover:text-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-xs text-danger">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
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
                    <span className="text-xs font-semibold text-ink">{col.name}</span>
                    <span className="font-mono text-[10px] text-body">{col.type}</span>
                    {col.isPrimaryKey && (
                      <span className="rounded-full bg-primary px-1.5 py-0.2 font-mono text-[9px] uppercase font-semibold text-on-primary">pk</span>
                    )}
                    {!col.nullable && !col.isPrimaryKey && (
                      <span className="text-danger font-bold" title="Required">*</span>
                    )}
                  </label>

                  {inputType === "checkbox" ? (
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form[col.name] === "true" || form[col.name] === "1"}
                        disabled={isReadonly}
                        onChange={(e) => setValue(col.name, e.target.checked ? "true" : "false")}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-0"
                      />
                      <span className="text-xs font-mono text-ink">
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
                        "w-full rounded-lg border px-3.5 py-2 font-mono text-xs outline-none transition-all",
                        isReadonly
                          ? "cursor-not-allowed border-transparent bg-surface-pressed text-mute"
                          : "border-transparent bg-canvas-soft text-ink placeholder:text-mute focus:border-ink focus:bg-canvas",
                      ].join(" ")}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-canvas px-6 py-4">
          {/* Delete zone (edit mode only) */}
          {isEdit && deletePhase === "idle" && (
            <button
              type="button"
              onClick={() => setDeletePhase("confirm")}
              className="flex items-center gap-1.5 rounded-full bg-danger/10 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/20 transition-colors"
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}

          {isEdit && deletePhase === "confirm" && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <input
                autoFocus
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder='Type "DELETE" to confirm'
                className="w-full min-w-[10rem] flex-1 rounded-lg border border-danger/60 bg-canvas px-3 py-1.5 font-mono text-xs text-danger placeholder:text-danger/40 focus:border-danger focus:outline-none sm:w-44 sm:flex-none"
              />
              <button
                type="button"
                disabled={deleteConfirmText !== "DELETE" || deleting}
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-full bg-danger px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {deleting && <Loader2 size={12} className="animate-spin" />}
                Confirm
              </button>
              <button
                type="button"
                onClick={() => { setDeletePhase("idle"); setDeleteConfirmText(""); }}
                className="rounded-full bg-canvas-soft px-3 py-1.5 text-xs font-medium text-body hover:bg-surface-pressed transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {!isEdit && <span />}

          {/* Save / Cancel */}
          {deletePhase === "idle" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-canvas-soft px-4 py-2 text-xs font-medium text-body hover:bg-surface-pressed hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex items-center gap-2 rounded-full bg-primary px-6 py-2 text-xs font-semibold text-on-primary shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {isEdit ? "Save changes" : "Insert record"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
