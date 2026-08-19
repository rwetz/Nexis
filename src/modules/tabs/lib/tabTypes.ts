// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  findLeaf,
  leaves,
  type PaneLeaf,
  type PaneNode,
  type TerminalPaneNode,
} from "@/modules/terminal/lib/panes";

// Matches the renderer slot pool size — over this we'd evict an active leaf.
export const MAX_PANES_PER_TAB = 4;

export type TerminalTab = {
  id: number;
  kind: "terminal";
  title: string;
  cwd?: string;
  /**
   * Title last set by the active pane via OSC 0 / OSC 2 escape sequences.
   * Shown in the tab label instead of the cwd basename when present.
   * Cleared when the active leaf changes or the session is reset.
   */
  oscTitle?: string;
  paneTree: TerminalPaneNode;
  activeLeafId: number;
  /** AI agent cannot read buffer / context of this terminal. */
  private?: boolean;
  /**
   * Stable id keying this tab's scrollback snapshot file on disk (restore
   * scrollback on relaunch). Minted lazily at exit-snapshot time, carried
   * across relaunches via tab persistence. Never set on private tabs.
   */
  snapshotId?: string;
};

/**
 * One file pane inside an editor tab. `dirty` mirrors the buffer's unsaved
 * state; `preview` marks the transient single-click state (replaced by the next
 * single-click rather than accumulating).
 */
export type EditorLeafData = {
  path: string;
  dirty?: boolean;
  preview?: boolean;
};

export type EditorPaneNode = PaneNode<EditorLeafData>;

export type EditorTab = {
  id: number;
  kind: "editor";
  title: string;
  /** Split tree of file panes (full parity with terminal tabs). */
  paneTree: EditorPaneNode;
  /** Leaf id of the focused file pane — the "current" file. */
  activeLeafId: number;
};

export function editorActiveLeaf(
  tab: EditorTab,
): PaneLeaf<EditorLeafData> | undefined {
  return findLeaf(tab.paneTree, tab.activeLeafId);
}

/** Path of the focused pane (the file the rest of the app treats as current). */
export function editorActivePath(tab: EditorTab): string {
  return editorActiveLeaf(tab)?.path ?? "";
}

/** Every file pane in this tab, left-to-right. */
export function editorLeaves(tab: EditorTab): PaneLeaf<EditorLeafData>[] {
  return leaves(tab.paneTree);
}

/** Every open file path across this tab's panes. */
export function editorLeafPaths(tab: EditorTab): string[] {
  return leaves(tab.paneTree).map((l) => l.path);
}

/** True if any pane in this tab has unsaved changes. */
export function editorAnyDirty(tab: EditorTab): boolean {
  return leaves(tab.paneTree).some((l) => l.dirty === true);
}

export type PreviewTab = {
  id: number;
  kind: "preview";
  title: string;
  url: string;
};

export type MarkdownTab = {
  id: number;
  kind: "markdown";
  title: string;
  path: string;
};

export type NotebookTab = {
  id: number;
  kind: "notebook";
  title: string;
  path: string;
};

export type ImageTab = {
  id: number;
  kind: "image";
  title: string;
  path: string;
};

export type AiDiffStatus = "pending" | "approved" | "rejected";

export type AiDiffTab = {
  id: number;
  kind: "ai-diff";
  title: string;
  path: string;
  /** "" for newly created files. */
  originalContent: string;
  proposedContent: string;
  /** Tool-call approval id used to resolve the AI SDK approval. */
  approvalId: string;
  status: AiDiffStatus;
  isNewFile: boolean;
};

export type GitDiffTab = {
  id: number;
  kind: "git-diff";
  title: string;
  path: string;
  repoRoot: string;
  mode: "-" | "+";
  originalPath: string | null;
};

export type GitHistoryTab = {
  id: number;
  kind: "git-history";
  title: string;
  repoRoot: string;
};

export type GitCommitFileDiffTab = {
  id: number;
  kind: "git-commit-file";
  title: string;
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

/**
 * The ML Lab's network diagram, detached from the sidebar panel. The panel
 * renders the same `<NetworkGraph>` at ~220px; a model with a few hundred
 * inputs needs more room than a rail can give it, so it gets a tab.
 *
 * Carries only the project dir — architecture, feature names, class labels
 * and learned weights are all read from the project and the ML store, so the
 * tab stays in step with training without any state of its own.
 */
export type MlNetworkTab = {
  id: number;
  kind: "ml-network";
  title: string;
  projectDir: string;
};

export type Tab =
  | TerminalTab
  | EditorTab
  | PreviewTab
  | MarkdownTab
  | NotebookTab
  | ImageTab
  | AiDiffTab
  | GitDiffTab
  | GitHistoryTab
  | GitCommitFileDiffTab
  | MlNetworkTab;

export type TabPatch = Partial<{
  title: string;
  cwd: string;
  path: string;
  dirty: boolean;
  url: string;
}>;

// Re-exported so existing "./tabTypes" importers keep working; the
// implementation is the shared one in lib/path.ts.
export { basename } from "@/lib/path";

export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url || "preview";
  }
}
