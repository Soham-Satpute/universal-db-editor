import { Database, TerminalSquare, Play } from "lucide-react";
import { useConnectionStore } from "../../store/connectionStore";

/**
 * Main area empty state styled as ex-empty-state-card from DESIGN (1).md.
 * Features 16px radius (rounded-2xl), canvas-soft surface, sentence-case display
 * typography, and clean monochrome styling.
 */
export function MainAreaEmptyState() {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeConnection = useConnectionStore((s) =>
    s.connections.find((connection) => connection.id === activeConnectionId),
  );
  const setActiveView = useConnectionStore((s) => s.setActiveView);

  if (activeConnection) {
    return (
      <main className="flex flex-1 items-center justify-center bg-canvas p-6">
        <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-border bg-canvas-soft p-10 text-center shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas border border-border-subtle text-ink shadow-sm">
            <Database size={24} />
          </div>
          <h2 className="mt-5 font-display text-xl font-bold tracking-tight text-ink">
            {activeConnection.name}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-body">
            Select a table or collection from the sidebar tree to browse and edit records, or jump straight into query execution.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              onClick={() => setActiveView("query")}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-medium text-on-primary hover:opacity-90 transition-opacity"
            >
              <Play size={13} />
              Open query playground
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-border bg-canvas-soft p-10 text-center shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas border border-border-subtle text-ink shadow-sm">
          <TerminalSquare size={24} />
        </div>
        <h2 className="mt-5 font-display text-xl font-bold tracking-tight text-ink">
          No database selected
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-body">
          Connect to SQLite, PostgreSQL, or MongoDB from the sidebar. Once connected, your tables, views, and indexes will appear here.
        </p>
      </div>
    </main>
  );
}
