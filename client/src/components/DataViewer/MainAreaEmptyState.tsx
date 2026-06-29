import { Database, TerminalSquare } from "lucide-react";
import { useConnectionStore } from "../../store/connectionStore";

/**
 * Right-hand main area empty states. App.tsx only renders this when
 * there's no active connection, or a connection but no table selected
 * yet — once both exist, DataGrid (or SchemaViewer/QueryPlayground/
 * ERDiagram) takes over instead.
 */
export function MainAreaEmptyState() {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeConnection = useConnectionStore((s) =>
    s.connections.find((connection) => connection.id === activeConnectionId),
  );

  if (activeConnection) {
    return (
      <main className="flex flex-1 items-center justify-center bg-canvas">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface">
            <Database size={20} className="text-text-faint" />
          </div>
          <h2 className="mt-4 font-display text-base font-medium text-text">
            {activeConnection.name}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Choose a table or collection from the sidebar.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-canvas">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface">
          <TerminalSquare size={20} className="text-text-faint" />
        </div>
        <h2 className="mt-4 font-display text-base font-medium text-text">
          No connection selected
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Add a database from the sidebar. Its tables or collections
          will show up here once connected.
        </p>
      </div>
    </main>
  );
}
