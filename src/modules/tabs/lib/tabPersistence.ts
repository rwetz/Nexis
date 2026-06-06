// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { Tab, EditorTab, TerminalTab } from "./tabTypes";
import { basename } from "./tabTypes";

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
};
type PersistedEditorTab = {
  kind: "editor";
  path: string;
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

export function serializeTabState(tabs: Tab[], activeId: number): PersistedTabState {
  const persisted: PersistedTab[] = [];
  for (const t of tabs) {
    if (t.kind === "terminal") {
      persisted.push({ kind: "terminal", title: t.title, cwd: t.cwd, private: t.private });
    } else if (t.kind === "editor" && !t.preview) {
      persisted.push({ kind: "editor", path: t.path });
    }
    // Skip: preview, ai-diff, git-diff, git-history, git-commit-file, markdown, notebook, image
  }
  const activeTab = tabs.find((t) => t.id === activeId);
  let activeIndex = 0;
  if (activeTab) {
    const serializedIdx = persisted.findIndex(
      (p) =>
        (p.kind === "terminal" && activeTab.kind === "terminal") ||
        (p.kind === "editor" &&
          activeTab.kind === "editor" &&
          (activeTab as EditorTab).path === p.path),
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
        cwd: p.cwd,
        paneTree: { kind: "leaf", id: leafId, cwd: p.cwd },
        activeLeafId: leafId,
        ...(p.private && { private: true }),
      };
      tabs.push(tab);
      if (i === saved.activeIndex) activeId = tabId;
    } else if (p.kind === "editor") {
      const tabId = id++;
      const tab: EditorTab = {
        id: tabId,
        kind: "editor",
        title: basename(p.path),
        path: p.path,
        dirty: false,
        preview: false,
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
