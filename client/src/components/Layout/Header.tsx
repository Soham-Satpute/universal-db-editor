import { Moon, Sun, PanelLeftClose, PanelLeft } from "lucide-react";
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
  const sidebarOpen = useConnectionStore((s) => s.sidebarOpen);
  const toggleSidebar = useConnectionStore((s) => s.toggleSidebar);
  const sidebarCollapsed = useConnectionStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapse = useConnectionStore((s) => s.toggleSidebarCollapse);
  const { theme, toggleTheme } = useTheme();

  function handleToggleSidebar() {
    if (window.innerWidth < 768) {
      toggleSidebar();
    } else {
      toggleSidebarCollapse();
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-canvas px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggleSidebar}
          title="Toggle sidebar (Ctrl+B)"
          aria-label="Toggle sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas-soft text-ink hover:bg-surface-pressed transition-colors"
        >
          {/* Desktop icon */}
          <span className="hidden md:inline-flex">
            {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </span>
          {/* Mobile icon */}
          <span className="inline-flex md:hidden">
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </span>
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
