// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type React from "react";
import { dirname } from "@/lib/path";

// Pure drag-and-drop helpers for the file explorer. Kept free of React/Tauri so
// the move-validity logic can be unit-tested in isolation (lib/dnd.test.ts).

/** Forward-slash basename, trailing separators stripped. */
export function basename(path: string): string {
  const parts = path
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

/** Backslash → slash; strip a trailing slash but preserve a lone "/" root. */
function normalize(p: string): string {
  const s = p.replace(/\\/g, "/");
  return s.length > 1 ? s.replace(/\/+$/, "") : s;
}

/**
 * The directory a drop onto a given row targets: a folder receives items
 * directly; a file routes the drop into its own parent directory (matching the
 * VS Code behavior of "drop near a file ⇒ into its folder").
 */
export function moveTargetDir(rowPath: string, isDir: boolean): string {
  if (isDir) return rowPath;
  return dirname(rowPath) ?? rowPath;
}

/**
 * Whether `fromPath` may be moved into `targetDir`. Rejects the no-op cases and
 * the destructive ones that the backend would either refuse or that would orphan
 * a subtree:
 *   - moving an item into the directory it already lives in (no-op),
 *   - dropping a folder onto itself,
 *   - dropping a folder into one of its own descendants (would form a cycle).
 */
export function canMoveInto(fromPath: string, targetDir: string): boolean {
  const from = normalize(fromPath);
  const dir = normalize(targetDir);
  if (!from || !dir) return false;
  if (dir === from) return false; // onto itself
  if (dir.startsWith(`${from}/`)) return false; // into own descendant
  const parent = dirname(from);
  if (parent && normalize(parent) === dir) return false; // already here
  return true;
}

/**
 * Controller a row uses to participate in a move-drag. HTML5 drag-and-drop is
 * intercepted by Tauri's webview drag handler (the same reason the tab bar
 * reorders with mouse events — see TabBar.tsx), so the explorer drives moves
 * from raw mouse events instead: a row only reports its mousedown, and the
 * explorer's global listeners handle threshold, hit-testing, and the drop.
 */
export type ExplorerDrag = {
  /** Begin tracking a potential drag from a row on left-button mousedown. */
  onRowMouseDown: (e: React.MouseEvent, path: string) => void;
  /** True once if a drag just ended, so the trailing click is swallowed. */
  shouldSuppressClick: () => boolean;
};
