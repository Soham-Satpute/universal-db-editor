import { CheckCircle2, X, XCircle } from "lucide-react";
import type { ToastMessage } from "../hooks/useToast";

export type { ToastMessage };

/**
 * Floating notification styled as ex-toast from DESIGN (1).md.
 * Features 16px radius (rounded-2xl), Level 3 drop shadow, and crisp typography.
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
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 sm:justify-end sm:px-6">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-canvas px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition-all"
      >
        {toast.kind === "success" ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
            <CheckCircle2 size={15} />
          </div>
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <XCircle size={15} />
          </div>
        )}
        <span className="min-w-0 flex-1 text-xs font-medium text-ink leading-snug">
          {toast.message}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-mute hover:bg-surface-pressed hover:text-ink transition-colors"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
