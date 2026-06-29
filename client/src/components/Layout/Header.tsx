import { Moon, Sun } from "lucide-react";
import { useConnectionStore } from "../../store/connectionStore";
import { useTheme } from "../../hooks/useTheme";

/**
 * Top bar. The connection-status pill on the right is a deliberate
 * signature element: a small dot that will turn live/teal once an
 * actual connection exists (Day 2+). For now it just reflects
 * Zustand's `activeConnectionId`, which is always null on Day 1.
 *
 * Day 7 — the leading hamburger button only renders on <768px (md:hidden)
 * and toggles the sidebar drawer; the theme button toggles dark/light.
 */
export function Header() {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeConnection = useConnectionStore((s) =>
    s.connections.find((connection) => connection.id === activeConnectionId),
  );
  const toggleSidebar = useConnectionStore((s) => s.toggleSidebar);
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised hover:text-text md:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-accent-soft">
          <div className="h-2 w-2 rounded-[2px] bg-accent" />
        </div>
        <span className="font-display text-sm font-semibold tracking-wide text-text">
          Universal DB Editor
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-border-subtle px-3 py-1 sm:flex">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              activeConnectionId ? "bg-accent" : "bg-text-faint"
            }`}
          />
          <span className="font-mono text-xs text-text-muted">
            {activeConnection?.name ?? "no connection"}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label="Toggle theme"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised hover:text-text"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
