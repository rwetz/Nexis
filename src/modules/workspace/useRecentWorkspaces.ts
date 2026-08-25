// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { create } from "zustand";
import { stripVerbatimPrefix } from "@/lib/path";

const STORAGE_KEY = "nexis.recent-workspaces";
const MAX_ENTRIES = 12;

export type RecentWorkspace = {
  path: string;
  lastUsed: number;
};

type State = {
  workspaces: RecentWorkspace[];
  push: (path: string) => void;
  remove: (path: string) => void;
};

function load(): RecentWorkspace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentWorkspace[];
  } catch {
    return [];
  }
}

function save(entries: RecentWorkspace[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export function workspaceBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export const useRecentWorkspaces = create<State>((set, get) => ({
  workspaces: load(),

  push: (path: string) => {
    // stripVerbatimPrefix: canonicalized Windows paths arrive as `\\?\…`, and
    // slash-flipping that prefix yields the unspawnable "//?/…" hybrid
    // (pitfall #19). Never store it — a Recent Workspaces entry becomes a
    // terminal cwd via switchWorkspacePath.
    const normalized = stripVerbatimPrefix(path).replace(/\\/g, "/");
    const existing = get().workspaces.filter((w) => w.path !== normalized);
    const next: RecentWorkspace[] = [
      { path: normalized, lastUsed: Date.now() },
      ...existing,
    ].slice(0, MAX_ENTRIES);
    save(next);
    set({ workspaces: next });
  },

  remove: (path: string) => {
    const next = get().workspaces.filter((w) => w.path !== path);
    save(next);
    set({ workspaces: next });
  },
}));

export function pushRecentWorkspace(path: string) {
  useRecentWorkspaces.getState().push(path);
}
