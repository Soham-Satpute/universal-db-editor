/**
 * DangerConfirmModal — Day 6 security flow updated to DESIGN (1).md.
 * Shown whenever the backend blocks a destructive operation (queryGuard 403).
 * Formatted as an ex-modal-card with 16px radius, Level 2 drop shadow,
 * high-contrast pill actions, and sentence-case typography.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useConnectionStore } from "../store/connectionStore";

export function DangerConfirmModal() {
  const dangerPayload = useConnectionStore((s) => s.dangerPayload);
  const setDangerPayload = useConnectionStore((s) => s.setDangerPayload);

  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dangerPayload) {
      setTyped("");
      setError(null);
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [dangerPayload]);

  if (!dangerPayload) return null;

  const confirmed = typed === "CONFIRM";

  async function handleConfirm() {
    if (!confirmed || running || !dangerPayload) return;
    setRunning(true);
    setError(null);
    try {
      await dangerPayload.retry();
      setDangerPayload(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
      setRunning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") setDangerPayload(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => !running && setDangerPayload(null)}
    >
      {/* ex-modal-card: 16px radius, Level 2 shadow */}
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-canvas p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={running}
          onClick={() => setDangerPayload(null)}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-canvas-soft text-mute hover:bg-surface-pressed hover:text-ink disabled:opacity-40 transition-colors"
        >
          <X size={15} />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              Dangerous operation detected
            </h2>
            <p className="text-xs text-body">This action will modify or drop database objects permanently.</p>
          </div>
        </div>

        {/* Backend warning explanation */}
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 font-mono text-xs text-danger leading-relaxed">
          {dangerPayload.message}
        </p>

        {/* Input prompt */}
        <label className="mb-1.5 block text-xs font-semibold text-ink">
          Type <span className="font-mono font-bold text-danger">CONFIRM</span> to proceed:
        </label>
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="CONFIRM"
          disabled={running}
          className="mb-4 w-full rounded-lg border border-transparent bg-canvas-soft px-3.5 py-2.5 font-mono text-sm tracking-widest text-ink placeholder:text-mute focus:border-ink focus:bg-canvas outline-none transition-all"
        />

        {error && (
          <p className="mb-4 rounded-lg bg-danger/10 p-2.5 text-xs text-danger font-medium">
            {error}
          </p>
        )}

        {/* Actions: Pill hierarchy */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => setDangerPayload(null)}
            className="rounded-full bg-canvas-soft hover:bg-surface-pressed px-4 py-2 text-xs font-medium text-body transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed || running}
            onClick={handleConfirm}
            className="flex items-center gap-2 rounded-full bg-danger px-6 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 transition-opacity"
          >
            {running && <Loader2 size={13} className="animate-spin" />}
            Confirm operation
          </button>
        </div>
      </div>
    </div>
  );
}
