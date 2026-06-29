/**
 * DangerConfirmModal — Day 6 security flow.
 *
 * Shown whenever the backend returns { requiresConfirmation: true }.
 * The user must type "CONFIRM" exactly before the retry button activates.
 * On confirm it calls dangerPayload.retry() which re-submits the original
 * request with { confirmed: true } in the body.
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

  // Focus input when modal opens; reset state when it closes
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
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => !running && setDangerPayload(null)}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-md rounded-xl border border-danger/40 bg-canvas p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          disabled={running}
          onClick={() => setDangerPayload(null)}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-text-faint hover:bg-surface-raised hover:text-text disabled:opacity-40"
        >
          <X size={15} />
        </button>

        {/* Icon + heading */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15">
            <AlertTriangle size={20} className="text-danger" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-text">
              Dangerous Operation
            </h2>
            <p className="text-xs text-text-muted">This action may be irreversible.</p>
          </div>
        </div>

        {/* Error message from backend */}
        <p className="mb-4 rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-xs text-danger">
          {dangerPayload.message}
        </p>

        {/* Confirmation input */}
        <label className="mb-1 block text-xs font-medium text-text-muted">
          Type{" "}
          <span className="font-mono font-bold text-danger">CONFIRM</span>
          {" "}to proceed
        </label>
        <input
          ref={inputRef}
          type="text"
          value={typed}
          disabled={running}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="CONFIRM"
          className="mb-4 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text placeholder-text-faint outline-none ring-0 focus:border-danger focus:ring-1 focus:ring-danger/50 disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Runtime error */}
        {error && (
          <p className="mb-3 text-xs text-danger">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => setDangerPayload(null)}
            className="rounded-md border border-border-subtle px-4 py-2 text-sm text-text-muted hover:bg-surface-raised disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed || running}
            onClick={handleConfirm}
            className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {running && <Loader2 size={13} className="animate-spin" />}
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
