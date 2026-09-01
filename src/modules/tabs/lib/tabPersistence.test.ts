// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  registerPendingSessionRestore,
  takePendingSessionRestore,
} from "@/modules/terminal/lib/sessionRestore";
import {
  TABS_STORAGE_KEY,
  RESTORE_TABS_STORAGE_KEY,
  buildTabsFromSaved,
  clearSavedTabState,
  isFreshWindow,
  loadSavedTabState,
  saveTabState,
  serializeTabState,
  setSavedTabsEnabled,
  shouldRestoreTabs,
} from "./tabPersistence";
import type { Tab, TerminalTab } from "./tabTypes";

// Minimal localStorage stub — the Node test environment has none.
function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  return store;
}

function terminalTab(overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id: 1,
    kind: "terminal",
    title: "shell",
    cwd: "/home/me",
    paneTree: { kind: "leaf", id: 2, cwd: "/home/me" },
    activeLeafId: 2,
    ...overrides,
  };
}

let store: Map<string, string>;
beforeEach(() => {
  store = installLocalStorage();
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("scrollback-snapshot id persistence (Milestone A)", () => {
  it("round-trips snapshotId through serialize → build", () => {
    const tabs: Tab[] = [terminalTab({ snapshotId: "snap-abc" })];
    const state = serializeTabState(tabs, 1);
    expect(state.tabs[0]).toMatchObject({ kind: "terminal", snap: "snap-abc" });

    const built = buildTabsFromSaved(state, 1);
    const t = built.tabs[0];
    expect(t.kind).toBe("terminal");
    if (t.kind === "terminal") {
      expect(t.snapshotId).toBe("snap-abc");
      // Drain the side registration so later tests see a clean registry.
      takePendingSessionRestore(t.activeLeafId);
    }
  });

  it("never persists a snap id for private tabs", () => {
    const tabs: Tab[] = [
      terminalTab({ private: true, snapshotId: "should-not-leak" }),
    ];
    const state = serializeTabState(tabs, 1);
    expect(state.tabs[0]).not.toHaveProperty("snap");
    expect(state.tabs[0]).toMatchObject({ private: true });
  });

  it("registers a pending session restore for the rebuilt leaf", () => {
    const state = serializeTabState([terminalTab({ snapshotId: "snap-1" })], 1);
    const built = buildTabsFromSaved(state, 10);
    const t = built.tabs[0];
    if (t.kind !== "terminal") throw new Error("expected terminal tab");
    expect(takePendingSessionRestore(t.activeLeafId)).toBe("snap-1");
    // Consumed — a second take finds nothing.
    expect(takePendingSessionRestore(t.activeLeafId)).toBeNull();
  });

  it("registers nothing for tabs without a snap id", () => {
    const state = serializeTabState([terminalTab()], 1);
    expect(state.tabs[0]).not.toHaveProperty("snap");
    const built = buildTabsFromSaved(state, 1);
    const t = built.tabs[0];
    if (t.kind !== "terminal") throw new Error("expected terminal tab");
    expect(takePendingSessionRestore(t.activeLeafId)).toBeNull();
  });

  it("re-registration with the same pair is idempotent", () => {
    registerPendingSessionRestore(42, "snap-x");
    registerPendingSessionRestore(42, "snap-x");
    expect(takePendingSessionRestore(42)).toBe("snap-x");
    expect(takePendingSessionRestore(42)).toBeNull();
  });
});

describe("tab state round-trip", () => {
  it("keeps terminal cwd/title/private and restores the active index", () => {
    const tabs: Tab[] = [
      terminalTab({ id: 1, title: "build", cwd: "/w" }),
      terminalTab({
        id: 3,
        title: "private",
        private: true,
        paneTree: { kind: "leaf", id: 4 },
        activeLeafId: 4,
      }),
    ];
    const state = serializeTabState(tabs, 1);
    expect(state.tabs).toHaveLength(2);

    const built = buildTabsFromSaved(state, 1);
    expect(built.tabs).toHaveLength(2);
    const [a, b] = built.tabs;
    expect(a).toMatchObject({ kind: "terminal", title: "build", cwd: "/w" });
    expect(b).toMatchObject({ kind: "terminal", private: true });
  });

  it("falls back to a single fresh terminal when nothing is restorable", () => {
    const built = buildTabsFromSaved({ version: 1, tabs: [], activeIndex: 0 }, 1);
    expect(built.tabs).toHaveLength(1);
    expect(built.tabs[0].kind).toBe("terminal");
  });

  // Pitfall 19 regression: older builds stored slash-flipped verbatim paths
  // ("//?/C:/…") as tab cwds, and pty_open rejects that hybrid with
  // "cwd not accessible (os error 3)" — bricking the tab on every launch.
  it("heals mangled verbatim-prefix cwds and editor paths on restore (pitfall 23)", () => {
    const saved = {
      version: 1 as const,
      activeIndex: 0,
      tabs: [
        {
          kind: "terminal" as const,
          title: "shell",
          cwd: "//?/C:/Users/ryan/Dev/scratch-transformer",
        },
        {
          kind: "editor" as const,
          tree: {
            kind: "leaf" as const,
            path: "//?/C:/Users/ryan/Dev/scratch-transformer/model/attention.py",
          },
          activePath:
            "//?/C:/Users/ryan/Dev/scratch-transformer/model/attention.py",
        },
      ],
    };

    const built = buildTabsFromSaved(saved, 1);
    const term = built.tabs[0] as TerminalTab;
    expect(term.cwd).toBe("C:/Users/ryan/Dev/scratch-transformer");
    const paneLeaf = term.paneTree.kind === "leaf" ? term.paneTree : null;
    expect(paneLeaf?.cwd).toBe("C:/Users/ryan/Dev/scratch-transformer");

    const editor = built.tabs[1];
    if (editor.kind !== "editor") throw new Error("expected editor tab");
    const editorLeaves = editor.paneTree;
    expect(
      editorLeaves.kind === "leaf" ? editorLeaves.path : "",
    ).toBe("C:/Users/ryan/Dev/scratch-transformer/model/attention.py");
  });
});

describe("localStorage-backed save/load", () => {
  it("saves and reloads state", () => {
    saveTabState([terminalTab()], 1);
    const loaded = loadSavedTabState();
    expect(loaded).not.toBeNull();
    expect(loaded?.tabs[0]).toMatchObject({ kind: "terminal", title: "shell" });
  });

  it("does not overwrite good state with an empty serialization", () => {
    saveTabState([terminalTab()], 1);
    const before = store.get(TABS_STORAGE_KEY);
    // Only non-serializable tabs open (e.g. a git-diff tab) — keep old state.
    const gitDiff = {
      id: 9,
      kind: "git-diff",
      title: "x",
      path: "p",
      repoRoot: "r",
      mode: "-",
      originalPath: null,
    } as Tab;
    saveTabState([gitDiff], 9);
    expect(store.get(TABS_STORAGE_KEY)).toBe(before);
  });

  it("rejects unknown versions and garbage", () => {
    store.set(TABS_STORAGE_KEY, JSON.stringify({ version: 99, tabs: [{}] }));
    expect(loadSavedTabState()).toBeNull();
    store.set(TABS_STORAGE_KEY, "not json");
    expect(loadSavedTabState()).toBeNull();
    expect(clearSavedTabState()).toBeUndefined();
    expect(store.has(TABS_STORAGE_KEY)).toBe(false);
  });

  it("restore-tabs flag defaults on, and disabling clears saved state", () => {
    expect(shouldRestoreTabs()).toBe(true);
    saveTabState([terminalTab()], 1);
    setSavedTabsEnabled(false);
    expect(shouldRestoreTabs()).toBe(false);
    expect(store.get(RESTORE_TABS_STORAGE_KEY)).toBe("false");
    expect(store.has(TABS_STORAGE_KEY)).toBe(false);
    setSavedTabsEnabled(true);
    expect(shouldRestoreTabs()).toBe(true);
  });

  it("isFreshWindow is false without a browser window", () => {
    expect(isFreshWindow()).toBe(false);
  });
});
