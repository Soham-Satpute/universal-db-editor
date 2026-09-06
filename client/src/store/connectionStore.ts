import { create } from "zustand";
import type { Connection, ExplorerTree } from "../types";

export type ActiveView = "data" | "query" | "schema" | "erd";

/** Payload kept when the backend returns requiresConfirmation: true */
export interface DangerPayload {
  message: string;
  /** Call this to re-run the original request after the user confirms */
  retry: () => Promise<void>;
}

interface ConnectionState {
  connections: Connection[];
  activeConnectionId: string | null;
  activeTable: string | null;
  activeView: ActiveView;

  /** Tables/views/indexes for the active connection. Populated by
   *  DatabaseTree once it loads, and read by QueryPlayground's
   *  QueryBuilder so it can list every table, not just the active one. */
  explorerTree: ExplorerTree | null;

  /** Non-null when a dangerous-operation confirmation is needed */
  dangerPayload: DangerPayload | null;

  /** Mobile drawer state for the sidebar (<768px). Ignored on desktop,
   *  where the sidebar is always visible via the md: breakpoint. */
  sidebarOpen: boolean;

  setConnections: (connections: Connection[]) => void;
  setActiveConnection: (connectionId: string | null) => void;
  setActiveTable: (table: string | null) => void;
  setActiveView: (view: ActiveView) => void;
  setExplorerTree: (tree: ExplorerTree | null) => void;
  setDangerPayload: (payload: DangerPayload | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  activeConnectionId: null,
  activeTable: null,
  activeView: "data",
  explorerTree: null,
  dangerPayload: null,
  sidebarOpen: false,

  setConnections: (connections) => set({ connections }),

  setActiveConnection: (connectionId) =>
    set({
      activeConnectionId: connectionId,
      activeTable: null,
      activeView: "data",
      explorerTree: null,
      // Note: sidebarOpen is intentionally left alone here. Expanding a
      // connection now reveals its table tree inline (see Sidebar.tsx),
      // so auto-closing the mobile drawer would hide it immediately.
      // The drawer closes once a table is actually picked, below.
    }),

  setActiveTable: (table) => set({ activeTable: table, activeView: "data", sidebarOpen: false }),

  setActiveView: (view) => set({ activeView: view }),

  setExplorerTree: (tree) => set({ explorerTree: tree }),

  setDangerPayload: (payload) => set({ dangerPayload: payload }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
