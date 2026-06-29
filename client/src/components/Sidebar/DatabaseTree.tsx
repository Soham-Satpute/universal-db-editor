import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Folder,
  KeyRound,
  Loader2,
} from "lucide-react";
import { fetchExplorerTree } from "../../api/explorer";
import { useConnectionStore } from "../../store/connectionStore";
import type { ExplorerTree } from "../../types";

interface DatabaseTreeProps {
  onError: (message: string) => void;
}

type SectionKey = "tables" | "views" | "indexes";

const sectionMeta: Record<SectionKey, { label: string; Icon: typeof Folder }> = {
  tables: { label: "Tables", Icon: Folder },
  views: { label: "Views", Icon: Folder },
  indexes: { label: "Indexes", Icon: KeyRound },
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === "string") return response.data.error;
  }
  return error instanceof Error ? error.message : "Failed to load database tree";
}

export function DatabaseTree({ onError }: DatabaseTreeProps) {
  const connections = useConnectionStore((s) => s.connections);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeTable = useConnectionStore((s) => s.activeTable);
  const setActiveTable = useConnectionStore((s) => s.setActiveTable);
  const setExplorerTree = useConnectionStore((s) => s.setExplorerTree);

  const [tree, setTree] = useState<ExplorerTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    tables: true,
    views: true,
    indexes: false,
  });

  const activeConnection = useMemo(
    () => connections.find((connection) => connection.id === activeConnectionId),
    [activeConnectionId, connections],
  );
  const isMongo = activeConnection?.type === "mongodb";

  useEffect(() => {
    if (!activeConnectionId) {
      setTree(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetchExplorerTree(activeConnectionId)
      .then((nextTree) => {
        setTree(nextTree);
        setExplorerTree(nextTree);
      })
      .catch((err) => {
        const message = getErrorMessage(err);
        setError(message);
        setTree(null);
        onError(message);
      })
      .finally(() => setLoading(false));
  }, [activeConnectionId, onError, setExplorerTree]);

  if (!activeConnectionId) {
    return null;
  }

  return (
    <div className="border-t border-border px-3 py-3">
      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium uppercase text-text-faint">
        <Database size={14} />
        Database
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-md px-2 py-3 text-sm text-text-muted">
          <Loader2 size={15} className="animate-spin" />
          Loading tree
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-canvas px-3 py-2 text-sm text-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && tree && isMongo && (
        <div className="space-y-1">
          {tree.tables.length === 0 ? (
            <p className="px-2 py-2 text-sm text-text-faint">No collections found</p>
          ) : (
            tree.tables.map((collection) => (
              <TreeLeaf
                key={collection}
                label={collection}
                active={activeTable === collection}
                onClick={() => setActiveTable(collection)}
              />
            ))
          )}
        </div>
      )}

      {!loading && tree && !isMongo && (
        <div className="space-y-1">
          {(["tables", "views", "indexes"] as SectionKey[]).map((section) => {
            const items = tree[section];
            const { Icon, label } = sectionMeta[section];
            const isOpen = openSections[section];

            return (
              <div key={section}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-muted hover:bg-surface-raised hover:text-text"
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Icon size={14} className="text-text-faint" />
                  <span className="flex-1">{label}</span>
                  <span className="font-mono text-[11px] text-text-faint">{items.length}</span>
                </button>
                {isOpen && (
                  <div className="ml-5 mt-1 space-y-1">
                    {items.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-text-faint">Empty</p>
                    ) : (
                      items.map((item) => (
                        <TreeLeaf
                          key={`${section}-${item}`}
                          label={item}
                          active={section === "tables" && activeTable === item}
                          disabled={section !== "tables"}
                          onClick={() => section === "tables" && setActiveTable(item)}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TreeLeaf({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
        active
          ? "bg-accent-soft text-text"
          : disabled
            ? "cursor-default text-text-faint"
            : "text-text-muted hover:bg-surface-raised hover:text-text"
      }`}
    >
      <FileText size={14} className={active ? "text-accent" : "text-text-faint"} />
      <span className="truncate">{label}</span>
    </button>
  );
}
