import { Moon, Sun } from "lucide-react";
import { useConnectionStore } from "../../store/connectionStore";
import { useTheme } from "../../hooks/useTheme";

/**
 * Top nav bar styled according to DESIGN (1).md.
 * Features a high-contrast black-and-white duet, sentence-case display typography,
 * pill active-connection chip, and circular icon buttons.
 */
export function Header() {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeConnection = useConnectionStore((s) =>
    s.connections.find((connection) => connection.id === activeConnectionId),
  );
  const toggleSidebar = useConnectionStore((s) => s.toggleSidebar);
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-canvas px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas-soft text-ink hover:bg-surface-pressed md:hidden transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-on-primary font-bold text-xs">
            U
          </div>
          <span className="font-display text-sm sm:text-base font-bold tracking-tight text-ink">
            Universal DB Editor
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-border bg-canvas-soft px-3.5 py-1 sm:flex">
          <span
            className={`h-2 w-2 rounded-full transition-colors ${
              activeConnectionId ? "bg-primary" : "bg-mute"
            }`}
          />
          <span className="font-mono text-xs font-medium text-ink">
            {activeConnection?.name ?? "No connection"}
          </span>
          {activeConnection && (
            <span className="rounded-full bg-surface-pressed px-2 py-0.2 text-[10px] font-medium text-body uppercase">
              {activeConnection.type}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label="Toggle theme"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas-soft text-ink hover:bg-surface-pressed transition-colors"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
