// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { create } from "zustand";

export type RecentFile = {
  path: string;
  /** Unix ms timestamp of last open/edit */
  accessedAt: number;
};

const STORAGE_KEY = "nexis.recent-files";
const MAX_ENTRIES = 50;

function load(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentFile[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function save(files: RecentFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {}
}

type RecentFilesState = {
  files: RecentFile[];
  /** Record a file access. Moves to front if already present. */
  push: (path: string) => void;
  remove: (path: string) => void;
  clear: () => void;
};

export const useRecentFiles = create<RecentFilesState>((set) => ({
  files: load(),

  push: (path) =>
    set((s) => {
      const without = s.files.filter((f) => f.path !== path);
      const next: RecentFile[] = [
        { path, accessedAt: Date.now() },
        ...without,
      ].slice(0, MAX_ENTRIES);
      save(next);
      return { files: next };
    }),

  remove: (path) =>
    set((s) => {
      const next = s.files.filter((f) => f.path !== path);
      save(next);
      return { files: next };
    }),

  clear: () => {
    save([]);
    set({ files: [] });
  },
}));

/** Standalone push — callable outside React (e.g. from event handlers). */
export function pushRecentFile(path: string): void {
  useRecentFiles.getState().push(path);
}
