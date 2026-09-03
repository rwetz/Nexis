// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { EditorPaneNode, Tab, EditorTab, TerminalTab } from "./tabTypes";
import { basename, editorActivePath } from "./tabTypes";
import { stripVerbatimPrefix } from "@/lib/path";
import { leaves } from "@/modules/terminal/lib/panes";
import { registerPendingSessionRestore } from "@/modules/terminal/lib/sessionRestore";

// ─── Storage keys & constants ──────────────────────────────────────────────────

export const TABS_STORAGE_KEY = "nexis.saved-tabs";
export const RESTORE_TABS_STORAGE_KEY = "nexis.restore-tabs";
export const SAVE_DEBOUNCE_MS = 600;

// ─── Persisted schema ──────────────────────────────────────────────────────────

type PersistedTerminalTab = {
  kind: "terminal";
  title: string;
  cwd?: string;
  private?: boolean;
  /** Scrollback-snapshot id (see TerminalTab.snapshotId). */
  snap?: string;
};
/** Editor pane tree, mirrored structurally (ids are reassigned on restore). */
type PersistedEditorNode =
  | { kind: "leaf"; path: string }
  | { kind: "split"; dir: "row" | "col"; children: PersistedEditorNode[] };
type PersistedEditorTab = {
  kind: "editor";
  /** Full split tree. `path` is the legacy single-file form (still restored). */
  tree?: PersistedEditorNode;
  path?: string;
  /** Path of the pane that was focused, so it's re-focused on restore. */
  activePath?: string;
};
type PersistedTab = PersistedTerminalTab | PersistedEditorTab;
type PersistedTabState = {
  version: 1;
  tabs: PersistedTab[];
  activeIndex: number;
};

// ─── Public API ────────────────────────────────────────────────────────────────

/** True when this window was opened via "New Window" and should start fresh. */
export function isFreshWindow(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("fresh");
  } catch {
    return false;
  }
}

export function clearSavedTabState(): void {
  try {
    localStorage.removeItem(TABS_STORAGE_KEY);
  } catch {}
}

export function setSavedTabsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(RESTORE_TABS_STORAGE_KEY, enabled ? "true" : "false");
    if (!enabled) clearSavedTabState();
  } catch {}
}

export function shouldRestoreTabs(): boolean {
  try {
    const v = localStorage.getItem(RESTORE_TABS_STORAGE_KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

export function loadSavedTabState(): PersistedTabState | null {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PersistedTabState;
    if (s.version !== 1 || !Array.isArray(s.tabs) || !s.tabs.length) return null;
    return s;
  } catch {
    return null;
  }
}

function serializeEditorNode(n: EditorPaneNode): PersistedEditorNode {
  if (n.kind === "leaf") return { kind: "leaf", path: n.path };
  return {
    kind: "split",
    dir: n.dir,
    children: n.children.map(serializeEditorNode),
  };
}

export function serializeTabState(tabs: Tab[], activeId: number): PersistedTabState {
  const persisted: PersistedTab[] = [];
  for (const t of tabs) {
    if (t.kind === "terminal") {
      persisted.push({
        kind: "terminal",
        title: t.title,
        cwd: t.cwd,
        private: t.private,
        ...(t.snapshotId && !t.private && { snap: t.snapshotId }),
      });
    } else if (t.kind === "editor") {
      // Skip a lone, unpinned preview pane (matches the old behavior); split or
      // pinned tabs persist their full pane tree.
      if (t.paneTree.kind === "leaf" && t.paneTree.preview) continue;
      persisted.push({
        kind: "editor",
        tree: serializeEditorNode(t.paneTree),
        activePath: editorActivePath(t),
      });
    }
    // Skip: ai-diff, git-diff, git-history, git-commit-file, markdown,
    // notebook, image, ml-network, svg-playground
  }
  const activeTab = tabs.find((t) => t.id === activeId);
  let activeIndex = 0;
  if (activeTab) {
    const serializedIdx = persisted.findIndex(
      (p) =>
        (p.kind === "terminal" && activeTab.kind === "terminal") ||
        (p.kind === "editor" &&
          activeTab.kind === "editor" &&
          editorActivePath(activeTab) === p.activePath),
    );
    if (serializedIdx !== -1) activeIndex = serializedIdx;
  }
  return { version: 1, tabs: persisted, activeIndex };
}

export function buildTabsFromSaved(
  saved: PersistedTabState,
  startId: number,
): { tabs: Tab[]; activeId: number; nextId: number } {
  const tabs: Tab[] = [];
  let id = startId;
  let activeId = id;

  for (let i = 0; i < saved.tabs.length; i++) {
    const p = saved.tabs[i];
    if (p.kind === "terminal") {
      const tabId = id++;
      const leafId = id++;
      const tab: TerminalTab = {
        id: tabId,
        kind: "terminal",
        title: p.title || "shell",
        // Heal mangled verbatim prefixes saved by older builds ("//?/C:/…",
        // pitfall #23): restoring one verbatim would brick this tab's shell
        // on every launch, since pty_open rejects the cwd with os error 3.
        cwd: p.cwd ? stripVerbatimPrefix(p.cwd) : undefined,
        paneTree: {
          kind: "leaf",
          id: leafId,
          cwd: p.cwd ? stripVerbatimPrefix(p.cwd) : undefined,
        },
        activeLeafId: leafId,
        ...(p.private && { private: true }),
        ...(p.snap && !p.private && { snapshotId: p.snap }),
      };
      if (tab.snapshotId) {
        // The new leaf replays its saved scrollback (if the file exists)
        // before its fresh shell spawns. Safe to re-register: this builder
        // runs more than once during init with deterministic ids.
        registerPendingSessionRestore(leafId, tab.snapshotId);
      }
      tabs.push(tab);
      if (i === saved.activeIndex) activeId = tabId;
    } else if (p.kind === "editor") {
      const tabId = id++;
      const buildNode = (n: PersistedEditorNode): EditorPaneNode => {
        if (n.kind === "leaf") {
          // Same pitfall #23 healing as terminal cwds above — editor leaves
          // persisted the mangled form too.
          return {
            kind: "leaf",
            id: id++,
            path: stripVerbatimPrefix(n.path),
            dirty: false,
            preview: false,
          };
        }
        return {
          kind: "split",
          id: id++,
          dir: n.dir,
          children: n.children.map(buildNode),
        };
      };
      // Prefer the persisted tree; fall back to the legacy single-path form.
      const source: PersistedEditorNode = p.tree ??
        (p.path ? { kind: "leaf", path: p.path } : { kind: "leaf", path: "" });
      const paneTree = buildNode(source);
      const all = leaves(paneTree);
      const activeLeaf =
        all.find((l) => l.path === p.activePath) ?? all[0];
      const tab: EditorTab = {
        id: tabId,
        kind: "editor",
        title: basename(activeLeaf?.path ?? ""),
        paneTree,
        activeLeafId: activeLeaf?.id ?? paneTree.id,
      };
      tabs.push(tab);
      if (i === saved.activeIndex) activeId = tabId;
    }
  }

  if (!tabs.length) {
    const tabId = id++;
    const leafId = id++;
    tabs.push({
      id: tabId,
      kind: "terminal",
      title: "shell",
      paneTree: { kind: "leaf", id: leafId },
      activeLeafId: leafId,
    });
    activeId = tabId;
  }

  return { tabs, activeId, nextId: id };
}

export function saveTabState(tabs: Tab[], activeId: number): void {
  try {
    const state = serializeTabState(tabs, activeId);
    // Don't overwrite a previously-good saved state with empty when the only
    // open tabs are non-serializable (ai-diff, git-diff, etc.). That would
    // wipe the user's terminal/editor tabs if the app reloads mid-session.
    if (state.tabs.length === 0 && tabs.length > 0) return;
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
