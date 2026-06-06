// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * bookmarkStore — lightweight localStorage-backed store for file bookmarks.
 *
 * A bookmark is a file path + optional line number + optional label.
 * Exported as plain functions + a Zustand-like reactive hook so components
 * can subscribe to changes without pulling in a full store.
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "nexis:bookmarks";

export type Bookmark = {
  id: string;
  path: string;
  line: number;    // 1-based; 0 = whole file (no specific line)
  label: string;   // user-supplied or auto-derived from basename:line
  createdAt: number;
};

// ── Internal state ────────────────────────────────────────────────────────────

let _bookmarks: Bookmark[] = load();
const _listeners = new Set<() => void>();

function load(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}

function persist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_bookmarks));
  _listeners.forEach((fn) => fn());
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getBookmarks(): readonly Bookmark[] {
  return _bookmarks;
}

export function addBookmark(path: string, line = 0, label?: string): Bookmark {
  // Deduplicate by path+line
  const existing = _bookmarks.find((b) => b.path === path && b.line === line);
  if (existing) return existing;

  const bm: Bookmark = {
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    path,
    line,
    label: label ?? (line > 0 ? `${basename(path)}:${line}` : basename(path)),
    createdAt: Date.now(),
  };
  _bookmarks = [..._bookmarks, bm];
  persist();
  return bm;
}

export function removeBookmark(id: string): void {
  _bookmarks = _bookmarks.filter((b) => b.id !== id);
  persist();
}

export function updateBookmarkLabel(id: string, label: string): void {
  _bookmarks = _bookmarks.map((b) => (b.id === id ? { ...b, label } : b));
  persist();
}

export function isBookmarked(path: string, line = 0): boolean {
  return _bookmarks.some((b) => b.path === path && b.line === line);
}

export function toggleBookmark(path: string, line = 0, label?: string): void {
  const existing = _bookmarks.find((b) => b.path === path && b.line === line);
  if (existing) {
    removeBookmark(existing.id);
  } else {
    addBookmark(path, line, label);
  }
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useBookmarks(): readonly Bookmark[] {
  const [bms, setBms] = useState<readonly Bookmark[]>(() => _bookmarks);

  useEffect(() => {
    const handler = () => setBms([..._bookmarks]);
    _listeners.add(handler);
    return () => { _listeners.delete(handler); };
  }, []);

  return bms;
}
