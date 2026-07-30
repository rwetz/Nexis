// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { create } from "zustand";

export type DbType = "sqlite" | "postgresql" | "mysql";

export type DbConnection = {
  id: string;
  name: string;
  type: DbType;
  connectionString: string;
};

type State = {
  connections: DbConnection[];
  activeId: string | null;
  add: (conn: Omit<DbConnection, "id">) => void;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
};

function newId(): string {
  return `db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
}

export const useDatabaseStore = create<State>((set) => ({
  connections: [],
  activeId: null,
  add: (conn) => {
    const id = newId();
    set((s) => ({ connections: [...s.connections, { ...conn, id }], activeId: id }));
  },
  remove: (id) => {
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }));
  },
  setActive: (id) => set({ activeId: id }),
}));

