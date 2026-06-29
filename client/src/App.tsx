import { useMemo } from "react";
import { Database, GitFork, Play, Table2 } from "lucide-react";
import { Header } from "./components/Layout/Header";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { MainAreaEmptyState } from "./components/DataViewer/MainAreaEmptyState";
import { DataGrid } from "./components/DataViewer/DataGrid";
import { QueryPlayground } from "./components/QueryPlayground/QueryPlayground";
import { SchemaViewer } from "./components/SchemaViewer/SchemaViewer";
import { ERDiagram } from "./components/ERDiagram/ERDiagram";
import { DangerConfirmModal } from "./components/DangerConfirmModal";
import { useConnectionStore, type ActiveView } from "./store/connectionStore";

// ---------------------------------------------------------------------------
// Tab definitions — ERD tab added for Day 6
// ---------------------------------------------------------------------------
const TABS: {
  id: ActiveView;
  label: string;
  Icon: typeof Database;
  /** if true, table selection is NOT required to enable this tab */
  noTableRequired?: boolean;
}[] = [
  { id: "data",   label: "Data",     Icon: Table2   },
  { id: "query",  label: "Query",    Icon: Play,     noTableRequired: true },
  { id: "schema", label: "Schema",   Icon: Database },
  { id: "erd",    label: "ER Diagram", Icon: GitFork, noTableRequired: true },
];

// ---------------------------------------------------------------------------
// TabBar
// ---------------------------------------------------------------------------
function TabBar() {
  const activeView      = useConnectionStore((s) => s.activeView);
  const setActiveView   = useConnectionStore((s) => s.setActiveView);
  const activeTable     = useConnectionStore((s) => s.activeTable);
  const activeConnId    = useConnectionStore((s) => s.activeConnectionId);
  const connections     = useConnectionStore((s) => s.connections);

  const activeConn = useMemo(
    () => connections.find((c) => c.id === activeConnId),
    [connections, activeConnId],
  );

  if (!activeConnId) return null;

  const isMongo = activeConn?.type === "mongodb";

  return (
    <div className="flex items-end gap-0.5 border-b border-border bg-surface px-4">
      {TABS.map(({ id, label, Icon, noTableRequired }) => {
        // Hide ERD tab for MongoDB
        if (id === "erd" && isMongo) return null;

        const disabled = !noTableRequired && !activeTable;
        const active   = activeView === id && !disabled;

        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setActiveView(id)}
            className={[
              "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors",
              active
                ? "border-accent text-accent"
                : disabled
                  ? "cursor-not-allowed border-transparent text-text-faint opacity-40"
                  : "border-transparent text-text-muted hover:text-text",
            ].join(" ")}
          >
            <Icon size={13} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MainContent
// ---------------------------------------------------------------------------
function MainContent() {
  const activeConnId  = useConnectionStore((s) => s.activeConnectionId);
  const activeTable   = useConnectionStore((s) => s.activeTable);
  const activeView    = useConnectionStore((s) => s.activeView);
  const connections   = useConnectionStore((s) => s.connections);
  const explorerTree  = useConnectionStore((s) => s.explorerTree);

  const activeConn = useMemo(
    () => connections.find((c) => c.id === activeConnId),
    [connections, activeConnId],
  );

  if (!activeConnId) return <MainAreaEmptyState />;

  if (activeView === "query") {
    return (
      <QueryPlayground
        key={activeConnId}
        connectionId={activeConnId}
        dbType={activeConn?.type ?? "sqlite"}
        activeTable={activeTable}
        explorerTree={explorerTree}
      />
    );
  }

  if (activeView === "erd") {
    return (
      <ERDiagram
        key={activeConnId}
        connectionId={activeConnId}
        dbType={activeConn?.type ?? "sqlite"}
      />
    );
  }

  if (!activeTable) return <MainAreaEmptyState />;

  if (activeView === "schema") {
    return (
      <SchemaViewer
        key={`${activeConnId}::${activeTable}`}
        connectionId={activeConnId}
        table={activeTable}
        dbType={activeConn?.type ?? "sqlite"}
      />
    );
  }

  // default: "data"
  return (
    <DataGrid
      key={`${activeConnId}::${activeTable}`}
      connectionId={activeConnId}
      table={activeTable}
    />
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
function App() {
  return (
    <div className="flex h-screen flex-col bg-canvas text-text">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TabBar />
          <MainContent />
        </div>
      </div>

      {/* Day 6 — global danger confirmation modal, rendered above everything */}
      <DangerConfirmModal />
    </div>
  );
}

export default App;
