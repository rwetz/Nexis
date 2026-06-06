// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";

export type SshConnection = {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  identityFile?: string;
};

const store = new LazyStore("nexis-ssh-connections.json", { defaults: {}, autoSave: 200 });
const KEY = "connections";

async function loadConnections(): Promise<SshConnection[]> {
  return (await store.get<SshConnection[]>(KEY)) ?? [];
}

async function saveConnections(list: SshConnection[]): Promise<void> {
  await store.set(KEY, list);
  await store.save();
}

export function newSshId(): string {
  return `ssh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function buildSshCommand(conn: SshConnection): string {
  const parts = ["ssh"];
  if (conn.port !== 22) parts.push("-p", String(conn.port));
  if (conn.identityFile) parts.push("-i", `"${conn.identityFile}"`);
  parts.push(`${conn.user}@${conn.host}`);
  return parts.join(" ");
}

type State = {
  hydrated: boolean;
  connections: SshConnection[];
  hydrate: () => Promise<void>;
  upsert: (conn: SshConnection) => void;
  remove: (id: string) => void;
};

let initialized = false;

export const useSshStore = create<State>((set, get) => ({
  hydrated: false,
  connections: [],
  hydrate: async () => {
    if (initialized) return;
    initialized = true;
    const saved = await loadConnections();
    set({ connections: saved, hydrated: true });
  },
  upsert: (conn) => {
    const list = get().connections;
    const idx = list.findIndex((c) => c.id === conn.id);
    const next = idx === -1 ? [...list, conn] : list.map((c) => (c.id === conn.id ? conn : c));
    set({ connections: next });
    void saveConnections(next);
  },
  remove: (id) => {
    const next = get().connections.filter((c) => c.id !== id);
    set({ connections: next });
    void saveConnections(next);
  },
}));
