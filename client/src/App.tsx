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
// Tab definitions
// ---------------------------------------------------------------------------
const TABS: {
  id: ActiveView;
  label: string;
  Icon: typeof Database;
  /** if true, table selection is NOT required to enable this tab */
  noTableRequired?: boolean;
}[] = [
  { id: "data",   label: "Data",        Icon: Table2   },
  { id: "query",  label: "Query",       Icon: Play,     noTableRequired: true },
  { id: "schema", label: "Schema",      Icon: Database },
  { id: "erd",    label: "ER Diagram",  Icon: GitFork,  noTableRequired: true },
];

// ---------------------------------------------------------------------------
// TabBar — styled with Uber-inspired pill geometry (rounded.pill 999px)
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
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border bg-canvas px-3 py-2 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex items-center gap-1 rounded-[36px] bg-canvas-soft p-1">
        {TABS.map(({ id, label, Icon, noTableRequired }) => {
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
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all",
                active
                  ? "bg-primary text-on-primary shadow-sm"
                  : disabled
                    ? "cursor-not-allowed text-mute opacity-40"
                    : "text-body hover:bg-surface-pressed hover:text-ink",
              ].join(" ")}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>
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
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden bg-canvas">
          <TabBar />
          <MainContent />
        </div>
      </div>

      <DangerConfirmModal />
    </div>
  );
}

export default App;
