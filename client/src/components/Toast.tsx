import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

export interface ToastMessage {
  kind: "success" | "error";
  message: string;
}

/**
 * Manages a single transient toast: shows it, auto-dismisses after
 * `duration` ms, and restarts the timer if a new toast supersedes one
 * still on screen. One hook instance = one toast slot for that component.
 */
export function useToast(duration = 3500) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (next: ToastMessage) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(next);
      timer.current = setTimeout(() => setToast(null), duration);
    },
    [duration],
  );

  const dismissToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { toast, showToast, dismissToast };
}

/**
 * Floating, dismissible notification for fire-and-forget outcomes —
 * a connection test passing/failing, a connection being saved or
 * deleted, an import finishing. Anchored bottom-right (bottom-center on
 * small screens) so it never collides with the sidebar drawer or the
 * danger-confirmation modal.
 *
 * Sticky/contextual errors (e.g. "this table failed to load") should
 * stay as inline banners next to the thing that failed — a toast that
 * vanishes on its own is the wrong fit for state the user still needs
 * to act on.
 */
export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:justify-end sm:px-6">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-md border border-border bg-canvas px-3 py-2.5 text-sm shadow-xl"
      >
        {toast.kind === "success" ? (
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" />
        ) : (
          <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />
        )}
        <span className="min-w-0 flex-1 text-text-muted">{toast.message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-mr-1 shrink-0 text-text-faint hover:text-text"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
