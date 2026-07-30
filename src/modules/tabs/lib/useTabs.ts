// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useCallback, useEffect, useRef, useState } from "react";
import {
  findLeaf,
  findLeafCwd,
  hasLeaf,
  leafIds,
  leaves,
  movePane,
  nextLeafId,
  removeLeaf,
  setLeafCwd as setLeafCwdInTree,
  siblingLeafOf,
  splitLeaf,
  updateLeaf,
  type SplitDir,
} from "@/modules/terminal/lib/panes";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  deleteSessionSnapshot,
  gcSessionSnapshots,
  saveSessionSnapshot,
} from "@/modules/terminal/lib/snapshot-bridge";
import {
  disposeSession,
  serializeSessionForExit,
} from "@/modules/terminal/lib/useTerminalSession";
import {
  MAX_PANES_PER_TAB,
  basename,
  titleFromUrl,
  type AiDiffStatus,
  type EditorTab,
  type GitCommitFileDiffTab,
  type GitDiffTab,
  type GitHistoryTab,
  type Tab,
  type TabPatch,
  type TerminalTab,
} from "./tabTypes";
import {
  SAVE_DEBOUNCE_MS,
  buildTabsFromSaved,
  isFreshWindow,
  loadSavedTabState,
  saveTabState,
  shouldRestoreTabs,
} from "./tabPersistence";

export function useTabs(initial?: Partial<TerminalTab>) {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    // If opened with an explicit launch dir, always start fresh in that dir.
    if (initial?.cwd) {
      const tabId = 1;
      const leafId = 2;
      return [
        {
          id: tabId,
          kind: "terminal",
          title: initial.title ?? "shell",
          cwd: initial.cwd,
          paneTree: { kind: "leaf", id: leafId, cwd: initial.cwd },
          activeLeafId: leafId,
        },
      ];
    }
    // Fresh windows (spawned via New Window) start with no tabs.
    if (isFreshWindow()) return [];
    // Attempt to restore previously saved tabs.
    if (shouldRestoreTabs()) {
      const saved = loadSavedTabState();
      if (saved) {
        const { tabs } = buildTabsFromSaved(saved, 1);
        return tabs;
      }
    }
    // No saved state — show the welcome screen (tabs.length === 0).
    return [];
  });

  const [activeId, setActiveId] = useState(() => {
    if (isFreshWindow()) return 0;
    if (!initial?.cwd && shouldRestoreTabs()) {
      const saved = loadSavedTabState();
      if (saved) {
        const { activeId } = buildTabsFromSaved(saved, 1);
        return activeId;
      }
    }
    return 1;
  });

  const nextIdRef = useRef((() => {
    // Count how many IDs were consumed during init.
    if (isFreshWindow()) return 1; // no tabs created yet
    if (!initial?.cwd && shouldRestoreTabs()) {
      const saved = loadSavedTabState();
      if (saved) return buildTabsFromSaved(saved, 1).nextId;
    }
    return 1; // no tabs created — welcome screen
  })());

  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Persist tab state to localStorage (debounced).
  // Fresh windows skip saving so they don't overwrite the main window's state.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFreshWindow() || !shouldRestoreTabs()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveTabState(tabs, activeId);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [tabs, activeId]);

  // ─── Exit snapshots (persistent sessions, Milestone A) ─────────────────────
  // On window close: mint snapshot ids for terminal tabs that lack one, save
  // tab state immediately (the debounced save may never fire), serialize each
  // non-private terminal's buffer to disk, and gc files for closed tabs. With
  // "Restore scrollback on relaunch" off, the gc keep-list is empty — every
  // snapshot file is wiped, so the restore path never sees one.
  const saveExitState = useCallback(async () => {
    const restoreScrollback =
      usePreferencesStore.getState().terminalRestoreScrollback;
    const tabs = tabsRef.current.map((t) =>
      t.kind === "terminal" && !t.private && !t.snapshotId && restoreScrollback
        ? { ...t, snapshotId: crypto.randomUUID() }
        : t,
    );
    saveTabState(tabs, activeIdRef.current);
    const keep: string[] = [];
    const ops: Promise<void>[] = [];
    if (restoreScrollback) {
      for (const t of tabs) {
        if (t.kind !== "terminal" || t.private || !t.snapshotId) continue;
        const content = serializeSessionForExit(t.activeLeafId);
        if (!content) continue;
        keep.push(t.snapshotId);
        ops.push(
          saveSessionSnapshot(t.snapshotId, content).catch((e) =>
            console.warn("[nexis] exit snapshot save failed:", e),
          ),
        );
      }
    }
    ops.push(
      gcSessionSnapshots(keep).catch((e) =>
        console.warn("[nexis] snapshot gc failed:", e),
      ),
    );
    await Promise.all(ops);
  }, []);

  useEffect(() => {
    if (isFreshWindow()) return;
    let exiting = false;
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested((event) => {
      // Second close request while saving (or restore disabled): let the
      // window close normally.
      if (exiting || !shouldRestoreTabs()) return;
      event.preventDefault();
      exiting = true;
      void (async () => {
        try {
          await Promise.race([
            saveExitState(),
            // Never let a hung IPC call block exit.
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        } finally {
          void win.destroy();
        }
      })();
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [saveExitState]);

  const newTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    setTabs((t) => [
      ...t,
      {
        id: tabId,
        kind: "terminal",
        title: "shell",
        cwd,
        paneTree: { kind: "leaf", id: leafId, cwd },
        activeLeafId: leafId,
      },
    ]);
    setActiveId(tabId);
    return tabId;
  }, []);

  const newPrivateTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    setTabs((t) => [
      ...t,
      {
        id: tabId,
        kind: "terminal",
        title: "private",
        cwd,
        paneTree: { kind: "leaf", id: leafId, cwd },
        activeLeafId: leafId,
        private: true,
      },
    ]);
    setActiveId(tabId);
    return tabId;
  }, []);

  /**
   * Opens a file in an editor tab.
   *
   * - `pin = true` (default) — opens or activates a **persistent** tab.
   *   If the path is currently in the preview slot it is promoted in-place.
   *   Use this for programmatic opens (AI diff, New File dialog, etc.).
   * - `pin = false` — VSCode-style **preview** tab. A single shared slot is
   *   reused: if a persistent tab for the path already exists it is activated;
   *   otherwise the current preview slot is replaced with the new path.
   */
  const openFileTab = useCallback((path: string, pin = true) => {
    // When the active editor tab is split, load the file into the focused pane
    // (VS Code's "active editor group" behavior) so a split can show different
    // files. Skipped if the focused pane is dirty — never clobber unsaved edits;
    // those fall through to the normal new-tab/dedup path below.
    const active = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (active?.kind === "editor" && leafIds(active.paneTree).length > 1) {
      const focused = findLeaf(active.paneTree, active.activeLeafId);
      if (focused && focused.path !== path && !focused.dirty) {
        const nextTabs = tabsRef.current.map((t) => {
          if (t.id !== active.id || t.kind !== "editor") return t;
          const paneTree = updateLeaf(t.paneTree, t.activeLeafId, {
            path,
            dirty: false,
            preview: false,
          });
          return { ...t, paneTree, title: basename(path) };
        });
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        setActiveId(active.id);
        return active.id;
      }
    }

    let targetId: number | null = null;
    const nextTabs = ((curr: Tab[]): Tab[] => {
      // Locate an existing editor tab + leaf showing this path. With splitting,
      // a path may live in any pane of any editor tab.
      const findMatch = (requirePersistent: boolean) => {
        for (const t of curr) {
          if (t.kind !== "editor") continue;
          for (const l of leaves(t.paneTree)) {
            if (l.path !== path) continue;
            if (requirePersistent && l.preview) continue;
            return { tabId: t.id, leafId: l.id };
          }
        }
        return null;
      };
      const newEditorTab = (preview: boolean): EditorTab => {
        const id = nextIdRef.current++;
        const leafId = nextIdRef.current++;
        targetId = id;
        return {
          id,
          kind: "editor",
          title: basename(path),
          paneTree: { kind: "leaf", id: leafId, path, dirty: false, preview },
          activeLeafId: leafId,
        };
      };

      if (pin) {
        // Persistent open: focus any leaf already showing the path, un-preview it.
        const match = findMatch(false);
        if (match) {
          targetId = match.tabId;
          return curr.map((t) =>
            t.id === match.tabId && t.kind === "editor"
              ? {
                  ...t,
                  paneTree: updateLeaf(t.paneTree, match.leafId, {
                    preview: false,
                  }),
                  activeLeafId: match.leafId,
                }
              : t,
          );
        }
        return [...curr, newEditorTab(false)];
      }

      // Preview open: a persistent leaf for this path wins.
      const persistent = findMatch(true);
      if (persistent) {
        targetId = persistent.tabId;
        return curr.map((t) =>
          t.id === persistent.tabId && t.kind === "editor"
            ? { ...t, activeLeafId: persistent.leafId }
            : t,
        );
      }
      // A preview leaf already showing this path — just focus it.
      const previewMatch = findMatch(false);
      if (previewMatch) {
        targetId = previewMatch.tabId;
        return curr.map((t) =>
          t.id === previewMatch.tabId && t.kind === "editor"
            ? { ...t, activeLeafId: previewMatch.leafId }
            : t,
        );
      }
      // Replace the current single-leaf preview tab, or append a new one. (Only
      // an unsplit editor tab can be the shared preview slot; split panes pin.)
      const previewIdx = curr.findIndex(
        (t) =>
          t.kind === "editor" &&
          t.paneTree.kind === "leaf" &&
          t.paneTree.preview === true,
      );
      const tab = newEditorTab(true);
      if (previewIdx === -1) return [...curr, tab];
      const next = [...curr];
      next[previewIdx] = tab;
      return next;
    })(tabsRef.current);
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    if (targetId !== null) setActiveId(targetId);
    return targetId as number | null;
  }, []);

  /**
   * Promotes the active pane of an editor tab from preview to persistent.
   * Called on double-click of the tab title. Dirty edits also auto-promote
   * (see `setEditorLeafDirty`).
   */
  const pinTab = useCallback((id: number) => {
    setTabs((curr) =>
      curr.map((t) =>
        t.id === id && t.kind === "editor"
          ? {
              ...t,
              paneTree: updateLeaf(t.paneTree, t.activeLeafId, {
                preview: false,
              }),
            }
          : t,
      ),
    );
  }, []);

  const openAiDiffTab = useCallback(
    (input: {
      path: string;
      originalContent: string;
      proposedContent: string;
      approvalId: string;
      isNewFile: boolean;
    }) => {
      const curr = tabsRef.current;
      const existing = curr.find(
        (t) => t.kind === "ai-diff" && t.approvalId === input.approvalId,
      );
      if (existing) {
        setActiveId(existing.id);
        return existing.id;
      }
      const id = nextIdRef.current++;
      const nextTabs: Tab[] = [
        ...curr,
        {
          id,
          kind: "ai-diff",
          title: `${basename(input.path)} (AI diff)`,
          path: input.path,
          originalContent: input.originalContent,
          proposedContent: input.proposedContent,
          approvalId: input.approvalId,
          status: "pending",
          isNewFile: input.isNewFile,
        },
      ];
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActiveId(id);
      return id;
    },
    [],
  );

  const setAiDiffStatus = useCallback(
    (approvalId: string, status: AiDiffStatus) => {
      setTabs((curr) =>
        curr.map((t) =>
          t.kind === "ai-diff" && t.approvalId === approvalId
            ? { ...t, status }
            : t,
        ),
      );
    },
    [],
  );

  const closeAiDiffTab = useCallback((approvalId: string) => {
    const curr = tabsRef.current;
    const target = curr.find(
      (t) => t.kind === "ai-diff" && t.approvalId === approvalId,
    );
    if (!target) return;
    // Last remaining tab: closing it would leave an empty window, so mark the
    // diff resolved in place instead.
    if (curr.length <= 1) {
      const nextTabs = curr.map((t) =>
        t.kind === "ai-diff" && t.approvalId === approvalId
          ? { ...t, status: "approved" as AiDiffStatus }
          : t,
      );
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      return;
    }
    const idx = curr.findIndex((t) => t.id === target.id);
    const nextTabs = curr.filter((t) => t.id !== target.id);
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    setActiveId((active) =>
      target.id === active ? nextTabs[Math.max(0, idx - 1)].id : active,
    );
  }, []);

  const newPreviewTab = useCallback((url: string) => {
    const id = nextIdRef.current++;
    setTabs((t) => [
      ...t,
      { id, kind: "preview", title: titleFromUrl(url), url },
    ]);
    setActiveId(id);
    return id;
  }, []);

  const newMarkdownTab = useCallback((path: string) => {
    const curr = tabsRef.current;
    const existing = curr.find((t) => t.kind === "markdown" && t.path === path);
    if (existing) {
      setActiveId(existing.id);
      return existing.id;
    }
    const id = nextIdRef.current++;
    const nextTabs: Tab[] = [
      ...curr,
      { id, kind: "markdown", title: basename(path), path },
    ];
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    setActiveId(id);
    return id;
  }, []);

  const newNotebookTab = useCallback((path: string) => {
    const curr = tabsRef.current;
    const existing = curr.find((t) => t.kind === "notebook" && t.path === path);
    if (existing) {
      setActiveId(existing.id);
      return existing.id;
    }
    const id = nextIdRef.current++;
    const nextTabs: Tab[] = [
      ...curr,
      { id, kind: "notebook", title: basename(path), path },
    ];
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    setActiveId(id);
    return id;
  }, []);

  const newImageTab = useCallback((path: string) => {
    const curr = tabsRef.current;
    const existing = curr.find((t) => t.kind === "image" && t.path === path);
    if (existing) {
      setActiveId(existing.id);
      return existing.id;
    }
    const id = nextIdRef.current++;
    const nextTabs: Tab[] = [
      ...curr,
      { id, kind: "image", title: basename(path), path },
    ];
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    setActiveId(id);
    return id;
  }, []);

  const openGitDiffTab = useCallback(
    (input: {
      path: string;
      repoRoot: string;
      mode: "-" | "+";
      originalPath?: string | null;
      title?: string;
    }) => {
      const curr = tabsRef.current;
      const existing = curr.find(
        (t) =>
          t.kind === "git-diff" &&
          t.repoRoot === input.repoRoot &&
          t.path === input.path &&
          t.mode === input.mode,
      );
      const computedTitle =
        input.title ?? `${basename(input.path)} (${input.mode})`;
      const originalPath = input.originalPath ?? null;

      if (existing) {
        const nextTabs = curr.map((t) =>
          t.id === existing.id
            ? { ...t, title: computedTitle, originalPath }
            : t,
        );
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        setActiveId(existing.id);
        return existing.id;
      }

      const id = nextIdRef.current++;
      const nextTabs = [
        ...curr,
        {
          id,
          kind: "git-diff",
          title: computedTitle,
          path: input.path,
          repoRoot: input.repoRoot,
          mode: input.mode,
          originalPath,
        } satisfies GitDiffTab,
      ];
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActiveId(id);
      return id;
    },
    [],
  );

  const openCommitHistoryTab = useCallback(
    (input: { repoRoot: string; branch?: string | null }) => {
      const curr = tabsRef.current;
      const existing = curr.find(
        (t) => t.kind === "git-history" && t.repoRoot === input.repoRoot,
      );
      const title = input.branch
        ? `History · ${input.branch}`
        : "Git History";
      if (existing) {
        const nextTabs = curr.map((t) =>
          t.id === existing.id ? { ...t, title } : t,
        );
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        setActiveId(existing.id);
        return existing.id;
      }
      const id = nextIdRef.current++;
      const nextTabs = [
        ...curr,
        {
          id,
          kind: "git-history",
          title,
          repoRoot: input.repoRoot,
        } satisfies GitHistoryTab,
      ];
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActiveId(id);
      return id;
    },
    [],
  );

  const openCommitFileDiffTab = useCallback(
    (input: {
      repoRoot: string;
      sha: string;
      shortSha: string;
      subject: string;
      path: string;
      originalPath: string | null;
    }) => {
      const curr = tabsRef.current;
      const existing = curr.find(
        (t) =>
          t.kind === "git-commit-file" &&
          t.repoRoot === input.repoRoot &&
          t.sha === input.sha &&
          t.path === input.path,
      );
      const title = `${basename(input.path)} @ ${input.shortSha}`;
      if (existing) {
        const nextTabs = curr.map((t) =>
          t.id === existing.id
            ? {
                ...t,
                title,
                subject: input.subject,
                originalPath: input.originalPath,
              }
            : t,
        );
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        setActiveId(existing.id);
        return existing.id;
      }
      const id = nextIdRef.current++;
      const nextTabs = [
        ...curr,
        {
          id,
          kind: "git-commit-file",
          title,
          repoRoot: input.repoRoot,
          sha: input.sha,
          shortSha: input.shortSha,
          subject: input.subject,
          path: input.path,
          originalPath: input.originalPath,
        } satisfies GitCommitFileDiffTab,
      ];
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActiveId(id);
      return id;
    },
    [],
  );

  const closeTab = useCallback((id: number) => {
    const curr = tabsRef.current;
    const idx = curr.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const target = curr[idx];
    const toDispose =
      target?.kind === "terminal" ? leafIds(target.paneTree) : [];
    const snapToDelete =
      target?.kind === "terminal" ? (target.snapshotId ?? null) : null;

    const nextTabs = curr.filter((t) => t.id !== id);
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    if (nextTabs.length > 0) {
      setActiveId((active) =>
        id === active ? nextTabs[Math.max(0, idx - 1)].id : active,
      );
    }
    for (const lid of toDispose) disposeSession(lid);
    if (snapToDelete) void deleteSessionSnapshot(snapToDelete).catch(() => {});
  }, []);

  const updateTab = useCallback((id: number, patch: TabPatch) => {
    setTabs((t) =>
      t.map((x) => {
        if (x.id !== id) return x;
        if (x.kind === "terminal") {
          return {
            ...x,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.cwd !== undefined && { cwd: patch.cwd }),
          };
        }
        if (x.kind === "preview") {
          return {
            ...x,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.url !== undefined && {
              url: patch.url,
              title: patch.title ?? titleFromUrl(patch.url),
            }),
          };
        }
        if (x.kind === "markdown") {
          return {
            ...x,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.path !== undefined && { path: patch.path }),
          };
        }
        if (x.kind === "notebook" || x.kind === "image") {
          return {
            ...x,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.path !== undefined && { path: patch.path }),
          };
        }
        // editor tab: only the tab-level title is patched here. Per-leaf state
        // (dirty / path / preview) is managed via the leaf-aware editor actions
        // (setEditorLeafDirty, renameEditorLeafPaths, pinTab).
        return {
          ...x,
          ...(patch.title !== undefined && { title: patch.title }),
        };
      }),
    );
  }, []);

  const selectByIndex = useCallback(
    (idx: number) => {
      const t = tabs[idx];
      if (t) setActiveId(t.id);
    },
    [tabs],
  );

  /**
   * Update a leaf's cwd; mirror to the tab's `cwd` when the leaf is active.
   * Bails out without setTabs when nothing actually changed — shell integration
   * re-emits OSC 7 on every prompt, so this fires at keystroke rate.
   */
  const setLeafCwd = useCallback((leafId: number, cwd: string) => {
    setTabs((curr) => {
      let changed = false;
      const next = curr.map((t) => {
        if (t.kind !== "terminal" || !hasLeaf(t.paneTree, leafId)) return t;
        const paneTree = setLeafCwdInTree(t.paneTree, leafId, cwd);
        const isActive = t.activeLeafId === leafId;
        const cwdChanged = isActive && t.cwd !== cwd;
        if (paneTree === t.paneTree && !cwdChanged) return t;
        changed = true;
        return { ...t, paneTree, ...(cwdChanged && { cwd }) };
      });
      return changed ? next : curr;
    });
  }, []);

  /**
   * Update the tab's OSC title when the active leaf emits an OSC 0/2 title
   * sequence. Only affects the tab whose `activeLeafId` matches `leafId`.
   * Bails out without setTabs when the title has not changed.
   */
  const setLeafOscTitle = useCallback((leafId: number, title: string) => {
    setTabs((curr) => {
      let changed = false;
      const next = curr.map((t) => {
        if (t.kind !== "terminal" || t.activeLeafId !== leafId) return t;
        if (!hasLeaf(t.paneTree, leafId)) return t;
        if (t.oscTitle === title) return t;
        changed = true;
        return { ...t, oscTitle: title };
      });
      return changed ? next : curr;
    });
  }, []);

  const focusPane = useCallback((tabId: number, leafId: number) => {
    setTabs((curr) =>
      curr.map((t) => {
        if (t.id !== tabId || t.kind !== "terminal") return t;
        if (!hasLeaf(t.paneTree, leafId)) return t;
        if (t.activeLeafId === leafId) return t;
        const cwd = findLeafCwd(t.paneTree, leafId);
        return {
          ...t,
          activeLeafId: leafId,
          ...(cwd !== undefined && { cwd }),
        };
      }),
    );
  }, []);

  const focusNextPaneInTab = useCallback((tabId: number, delta: 1 | -1) => {
    setTabs((curr) =>
      curr.map((t) => {
        if (t.id !== tabId || t.kind !== "terminal") return t;
        const next = nextLeafId(t.paneTree, t.activeLeafId, delta);
        if (next === t.activeLeafId) return t;
        const cwd = findLeafCwd(t.paneTree, next);
        return { ...t, activeLeafId: next, ...(cwd !== undefined && { cwd }) };
      }),
    );
  }, []);

  /** Split the active leaf of `tabId` along `dir`. Returns the new leaf id. */
  const splitActivePane = useCallback(
    (tabId: number, dir: SplitDir): number | null => {
      let newLeafId: number | null = null;
      setTabs((curr) =>
        curr.map((t) => {
          if (t.id !== tabId || t.kind !== "terminal") return t;
          if (leafIds(t.paneTree).length >= MAX_PANES_PER_TAB) return t;
          const splitId = nextIdRef.current++;
          const leafId = nextIdRef.current++;
          newLeafId = leafId;
          const paneTree = splitLeaf(
            t.paneTree,
            t.activeLeafId,
            splitId,
            leafId,
            dir,
            { cwd: t.cwd },
          );
          return { ...t, paneTree, activeLeafId: leafId };
        }),
      );
      return newLeafId;
    },
    [],
  );

  /** Reorder the active leaf of `tabId` within its split (see movePane). */
  const movePaneInTab = useCallback(
    (tabId: number, axis: SplitDir, delta: 1 | -1): void => {
      setTabs((curr) =>
        curr.map((t) => {
          if (t.id !== tabId || t.kind !== "terminal") return t;
          const paneTree = movePane(t.paneTree, t.activeLeafId, axis, delta);
          if (paneTree === t.paneTree) return t;
          return { ...t, paneTree };
        }),
      );
    },
    [],
  );

  const closePaneByLeaf = useCallback((leafId: number): void => {
    const curr = tabsRef.current;
    const tab = curr.find(
      (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
    );
    if (!tab || tab.kind !== "terminal") return;
    const newTree = removeLeaf(tab.paneTree, leafId);

    // Last pane in the tab: the tab goes with it — unless it's the only tab,
    // which would leave an empty window.
    if (newTree === null) {
      if (curr.length <= 1) return;
      const idx = curr.findIndex((x) => x.id === tab.id);
      const nextTabs = curr.filter((x) => x.id !== tab.id);
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActiveId((active) =>
        active === tab.id ? nextTabs[Math.max(0, idx - 1)].id : active,
      );
      disposeSession(leafId);
      const snap = tab.snapshotId ?? null;
      if (snap) void deleteSessionSnapshot(snap).catch(() => {});
      return;
    }

    const remaining = leafIds(newTree);
    let newActive = tab.activeLeafId;
    if (tab.activeLeafId === leafId) {
      const sib = siblingLeafOf(tab.paneTree, leafId);
      newActive = sib && remaining.includes(sib) ? sib : remaining[0];
    }
    const nextTabs = curr.map((x) =>
      x.id === tab.id && x.kind === "terminal"
        ? { ...x, paneTree: newTree, activeLeafId: newActive }
        : x,
    );
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    disposeSession(leafId);
  }, []);

  const closeActivePane = useCallback((tabId: number): boolean => {
    const curr = tabsRef.current;
    const t = curr.find((x) => x.id === tabId);
    if (!t || t.kind !== "terminal") return false;
    const target = t.activeLeafId;
    const newTree = removeLeaf(t.paneTree, target);

    // Last pane: the whole tab closes, unless it's the only one left.
    if (newTree === null) {
      if (curr.length <= 1) return false;
      const idx = curr.findIndex((x) => x.id === tabId);
      const nextTabs = curr.filter((x) => x.id !== tabId);
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActiveId((active) =>
        active === tabId ? nextTabs[Math.max(0, idx - 1)].id : active,
      );
      disposeSession(target);
      const snap = t.snapshotId ?? null;
      if (snap) void deleteSessionSnapshot(snap).catch(() => {});
      return true;
    }

    const remaining = leafIds(newTree);
    const sib = siblingLeafOf(t.paneTree, target);
    const newActive = sib && remaining.includes(sib) ? sib : remaining[0];
    const nextTabs = curr.map((x) =>
      x.id === tabId && x.kind === "terminal"
        ? { ...x, paneTree: newTree, activeLeafId: newActive }
        : x,
    );
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    disposeSession(target);
    return false;
  }, []);

  // ─── Editor pane actions (mirror the terminal ones; full split parity) ───
  // Editor panes have no PTY session, so there's nothing to dispose — the
  // per-leaf editor handles in App are pruned off the pane tree by effect.

  const editorTitleFor = (tree: EditorTab["paneTree"], leafId: number, fallback: string) => {
    const leaf = findLeaf(tree, leafId);
    return leaf ? basename(leaf.path) : fallback;
  };

  /** Update a file pane's dirty flag (keyed by leaf id — each EditorPane reports
   *  its own leaf). A pane auto-promotes out of preview once it becomes dirty. */
  const setEditorLeafDirty = useCallback(
    (leafId: number, dirty: boolean) => {
      setTabs((curr) =>
        curr.map((t) => {
          if (t.kind !== "editor" || !hasLeaf(t.paneTree, leafId)) return t;
          const paneTree = updateLeaf(
            t.paneTree,
            leafId,
            dirty ? { dirty, preview: false } : { dirty },
          );
          return paneTree === t.paneTree ? t : { ...t, paneTree };
        }),
      );
    },
    [],
  );

  /** Rewrite editor pane paths after a rename/move on disk. Updates any leaf
   *  whose path is `from` or sits under `from/`, and refreshes the tab title. */
  const renameEditorLeafPaths = useCallback((from: string, to: string) => {
    const remap = (p: string): string | null => {
      if (p === from) return to;
      if (p.startsWith(`${from}/`)) return `${to}${p.slice(from.length)}`;
      return null;
    };
    setTabs((curr) =>
      curr.map((t) => {
        if (t.kind !== "editor") return t;
        let paneTree = t.paneTree;
        let changed = false;
        for (const l of leaves(t.paneTree)) {
          const np = remap(l.path);
          if (np !== null && np !== l.path) {
            paneTree = updateLeaf(paneTree, l.id, { path: np });
            changed = true;
          }
        }
        if (!changed) return t;
        return { ...t, paneTree, title: editorTitleFor(paneTree, t.activeLeafId, t.title) };
      }),
    );
  }, []);

  /** Focus a file pane within an editor tab. */
  const focusEditorPane = useCallback((tabId: number, leafId: number) => {
    setTabs((curr) =>
      curr.map((t) => {
        if (t.id !== tabId || t.kind !== "editor") return t;
        if (t.activeLeafId === leafId || !hasLeaf(t.paneTree, leafId)) return t;
        return {
          ...t,
          activeLeafId: leafId,
          title: editorTitleFor(t.paneTree, leafId, t.title),
        };
      }),
    );
  }, []);

  const focusNextEditorPane = useCallback((tabId: number, delta: 1 | -1) => {
    setTabs((curr) =>
      curr.map((t) => {
        if (t.id !== tabId || t.kind !== "editor") return t;
        const next = nextLeafId(t.paneTree, t.activeLeafId, delta);
        if (next === t.activeLeafId) return t;
        return {
          ...t,
          activeLeafId: next,
          title: editorTitleFor(t.paneTree, next, t.title),
        };
      }),
    );
  }, []);

  /** Split the active file pane of `tabId`; the new pane opens the same file. */
  const splitActiveEditorPane = useCallback(
    (tabId: number, dir: SplitDir): number | null => {
      let newLeafId: number | null = null;
      setTabs((curr) =>
        curr.map((t) => {
          if (t.id !== tabId || t.kind !== "editor") return t;
          if (leafIds(t.paneTree).length >= MAX_PANES_PER_TAB) return t;
          const active = findLeaf(t.paneTree, t.activeLeafId);
          if (!active) return t;
          const splitId = nextIdRef.current++;
          const leafId = nextIdRef.current++;
          newLeafId = leafId;
          const paneTree = splitLeaf(t.paneTree, t.activeLeafId, splitId, leafId, dir, {
            path: active.path,
            dirty: false,
            preview: false,
          });
          return { ...t, paneTree, activeLeafId: leafId };
        }),
      );
      return newLeafId;
    },
    [],
  );

  /** Close one file pane; collapse single-child splits; close the tab when its
   *  last pane goes. */
  const closeEditorPaneByLeaf = useCallback((leafId: number): void => {
    const curr = tabsRef.current;
    const tab = curr.find(
      (t) => t.kind === "editor" && hasLeaf(t.paneTree, leafId),
    );
    if (!tab || tab.kind !== "editor") return;
    const newTree = removeLeaf(tab.paneTree, leafId);

    // Last pane in the tab: the tab closes too, unless it's the only tab.
    if (newTree === null) {
      if (curr.length <= 1) return;
      const idx = curr.findIndex((x) => x.id === tab.id);
      const nextTabs = curr.filter((x) => x.id !== tab.id);
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActiveId((active) =>
        active === tab.id ? nextTabs[Math.max(0, idx - 1)].id : active,
      );
      return;
    }

    const remaining = leafIds(newTree);
    let newActive = tab.activeLeafId;
    if (tab.activeLeafId === leafId) {
      const sib = siblingLeafOf(tab.paneTree, leafId);
      newActive = sib && remaining.includes(sib) ? sib : remaining[0];
    }
    const nextTabs = curr.map((x) =>
      x.id === tab.id
        ? {
            ...x,
            paneTree: newTree,
            activeLeafId: newActive,
            title: editorTitleFor(newTree, newActive, x.title),
          }
        : x,
    );
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
  }, []);

  const moveEditorPaneInTab = useCallback(
    (tabId: number, axis: SplitDir, delta: 1 | -1): void => {
      setTabs((curr) =>
        curr.map((t) => {
          if (t.id !== tabId || t.kind !== "editor") return t;
          const paneTree = movePane(t.paneTree, t.activeLeafId, axis, delta);
          return paneTree === t.paneTree ? t : { ...t, paneTree };
        }),
      );
    },
    [],
  );

  /** Apply a fully reordered tab list by ID array (result of a drag operation). */
  const reorderTabs = useCallback((newOrder: number[]) => {
    setTabs((curr) => {
      const map = new Map(curr.map((t) => [t.id, t]));
      return newOrder.map((id) => map.get(id)!).filter(Boolean);
    });
  }, []);

  const resetWorkspace = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    const curr = tabsRef.current;
    const toDispose = curr.flatMap((t) =>
      t.kind === "terminal" ? leafIds(t.paneTree) : [],
    );
    const snapsToDelete = curr.flatMap((t) =>
      t.kind === "terminal" && t.snapshotId ? [t.snapshotId] : [],
    );
    const nextTabs: Tab[] = [
      {
        id: tabId,
        kind: "terminal",
        title: "shell",
        cwd,
        paneTree: { kind: "leaf", id: leafId, cwd },
        activeLeafId: leafId,
      },
    ];
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    setActiveId(tabId);
    for (const lid of toDispose) disposeSession(lid);
    for (const snap of snapsToDelete)
      void deleteSessionSnapshot(snap).catch(() => {});
  }, []);

  return {
    tabs,
    activeId,
    setActiveId,
    newTab,
    newPrivateTab,
    openFileTab,
    pinTab,
    newPreviewTab,
    newMarkdownTab,
    newNotebookTab,
    newImageTab,
    openAiDiffTab,
    openGitDiffTab,
    openCommitHistoryTab,
    openCommitFileDiffTab,
    setAiDiffStatus,
    closeAiDiffTab,
    closeTab,
    updateTab,
    selectByIndex,
    setLeafCwd,
    setLeafOscTitle,
    focusPane,
    focusNextPaneInTab,
    splitActivePane,
    movePaneInTab,
    closeActivePane,
    closePaneByLeaf,
    setEditorLeafDirty,
    renameEditorLeafPaths,
    focusEditorPane,
    focusNextEditorPane,
    splitActiveEditorPane,
    closeEditorPaneByLeaf,
    moveEditorPaneInTab,
    resetWorkspace,
    reorderTabs,
  };
}

