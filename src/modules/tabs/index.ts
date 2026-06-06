// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export { TabBar } from "./TabBar";
export { useTabs } from "./lib/useTabs";
export { MAX_PANES_PER_TAB } from "./lib/tabTypes";
export type {
  Tab,
  TerminalTab,
  EditorTab,
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
