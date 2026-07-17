// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export { TabBar, labelFor } from "./TabBar";
export { TabSwitcher } from "./TabSwitcher";
export { useTabs } from "./lib/useTabs";
export { useMruTabSwitcher } from "./lib/useMruTabSwitcher";
export {
  MAX_PANES_PER_TAB,
  editorActiveLeaf,
  editorActivePath,
  editorLeaves,
  editorLeafPaths,
  editorAnyDirty,
} from "./lib/tabTypes";
export type {
  Tab,
  TerminalTab,
  EditorTab,
  EditorLeafData,
  EditorPaneNode,
  PreviewTab,
  MarkdownTab,
  NotebookTab,
  ImageTab,
  AiDiffTab,
  GitDiffTab,
  GitHistoryTab,
  GitCommitFileDiffTab,
  AiDiffStatus,
  TabPatch,
} from "./lib/tabTypes";
export { setSavedTabsEnabled } from "./lib/tabPersistence";
export { useWorkspaceCwd } from "./lib/useWorkspaceCwd";
