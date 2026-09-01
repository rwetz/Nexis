// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WindowResizeEdges } from "@/components/WindowResizeEdges";
import { QuickFilePicker } from "@/components/QuickFilePicker";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { WorkspaceSearch } from "@/components/WorkspaceSearch";
import { CommandPalette, type CommandDef } from "@/components/CommandPalette";
import { ShellHistoryOverlay } from "@/components/ShellHistoryOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { packEnabled, viewEnabled } from "@/lib/packs";
import { dirname, stripVerbatimPrefix } from "@/lib/path";
import { useSidebarState, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from "./useSidebarState";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useDialogCoordinator } from "./useDialogCoordinator";
import {
  AgentRunBridge,
  AiMiniWindow,
  FloatingAiPanel,
  getAllKeys,
  hasAnyKey,
  SelectionAskAi,
  useChatStore,
} from "@/modules/ai";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { redactSensitive } from "@/modules/ai/lib/redact";
import { native } from "@/modules/ai/lib/native";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { useSnippetsStore } from "@/modules/ai/store/snippetsStore";
import {
  AiDiffStack,
  EditorStack,
  GitDiffStack,
  NewEditorDialog,
  type EditorPaneHandle,
} from "@/modules/editor";
import {
  GitHistoryStack,
  type GitHistorySearchHandle,
} from "@/modules/git-history";
import { getLaunchDir } from "@/lib/launchDir";
import { useZoom } from "@/lib/useZoom";
import { FileExplorer, type FileExplorerHandle } from "@/modules/explorer";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { PreviewStack, type PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { openNewWindow } from "@/modules/window/openNewWindow";
import { WelcomeScreen } from "./WelcomeScreen";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  useQuickTerminalDismiss,
  useQuickTerminalHotkey,
} from "@/modules/window/useQuickTerminal";
import { useSettingsDialogStore } from "@/modules/settings/settingsDialogStore";
import { onKeysChanged, setTerminalEnvVars } from "@/modules/settings/store";
import {
  ShortcutsDialog,
  useGlobalShortcuts,
  type ShortcutHandlers,
  type ShortcutId,
} from "@/modules/shortcuts";
import {
  isPluginPanelViewId,
  PackGatePlaceholder,
  PluginPanelSlot,
  SidebarRail,
} from "@/modules/sidebar";
import { ActivityPanel, useBackgroundProcesses } from "@/modules/processes";
import { ProblemsPanel } from "@/modules/problems/ProblemsPanel";
import { SymbolOutlinePanel } from "@/modules/editor/SymbolOutlinePanel";
import { SnippetsPanel } from "@/modules/snippets";
import { TestRunnerPanel } from "@/modules/testrunner";
import { BuildPanel } from "@/modules/build/BuildPanel";
import { CodeReviewPanel } from "@/modules/code-review";
import { SharePanel, registerShareTerminalBufferProvider } from "@/modules/share";
import { SymbolSearchPanel } from "@/modules/symbol-search";
import { RefactorPanel, setRefactorCode } from "@/modules/refactor";
import { PromptTemplatesPanel } from "@/modules/prompt-templates";
import { BookmarksPanel, toggleBookmark } from "@/modules/bookmarks";
import { WorkspaceNotesPanel } from "@/modules/workspace-notes";
import { ShellSnippetsPanel, setShellSnippetSender } from "@/modules/shell-snippets";
import { SshPanel } from "@/modules/ssh";
import { PortsPanel } from "@/modules/ports";
import { ProfilesPanel } from "@/modules/profiles";
import { ReplPanel, sendToRepl } from "@/modules/repl";
import { ReleasePanel } from "@/modules/release";
import {
  SourceControlPanel,
  useSourceControl,
} from "@/modules/source-control";
import { StatusBar } from "@/modules/statusbar";
import { RecentFilesPanel, pushRecentFile } from "@/modules/recent-files";
import { pushRecentWorkspace } from "@/modules/workspace/useRecentWorkspaces";
import { PluginHost } from "@/lib/plugins/PluginHost";
import { PackOnboardingDialog } from "@/modules/settings/PackOnboardingDialog";
import {
  MAX_PANES_PER_TAB,
  TabSwitcher,
  labelFor,
  useMruTabSwitcher,
  useTabs,
  useWorkspaceCwd,
  setSavedTabsEnabled,
  editorActivePath,
  editorAnyDirty,
  editorLeaves,
  editorLeafPaths,
} from "@/modules/tabs";
import {
  disposeSession,
  findLeafCwd,
  gcSessionSnapshots,
  hasLeaf,
  leafIds,
  respawnSession,
  sessionHasRunningCommand,
  TerminalStack,
  type CommandFailure,
  type TerminalPaneHandle,
} from "@/modules/terminal";
import {
  ThemeProvider,
  onThemeEdit,
  starterTheme,
  writeThemeFile,
  themeFilePath,
} from "@/modules/theme";
import { saveCustomTheme } from "@/modules/theme/customThemes";
import { UpdaterDialog } from "@/modules/updater";
import {
  currentWorkspaceEnv,
  getWslHome,
  LOCAL_WORKSPACE,
  useWorkspaceEnvStore,
  workspaceEnvForPath,
  type WorkspaceEnv,
} from "@/modules/workspace";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { SearchAddon } from "@xterm/addon-search";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

const MarkdownStackLazy = lazy(() =>
  import("@/modules/markdown").then((m) => ({ default: m.MarkdownStack })),
);
const NotebookStackLazy = lazy(() =>
  import("@/modules/notebook").then((m) => ({ default: m.NotebookStack })),
);
const ImageStackLazy = lazy(() =>
  import("@/modules/image-viewer").then((m) => ({ default: m.ImageStack })),
);
// Heavy, rarely-open panels: keep them out of the main chunk so app startup
// doesn't pay their parse cost. Same pattern as the tab stacks above.
const SettingsDialogLazy = lazy(() =>
  import("@/settings/SettingsDialog").then((m) => ({ default: m.SettingsDialog })),
);
const MlPanelLazy = lazy(() =>
  import("@/modules/ml/MlPanel").then((m) => ({ default: m.MlPanel })),
);
// Lazy for the same reason as the panel: the network tab pulls in the whole
// ML graph/artifact reading stack, which nobody who never opens it should pay
// the parse cost for.
const MlNetworkStackLazy = lazy(() =>
  import("@/modules/ml/MlNetworkStack").then((m) => ({
    default: m.MlNetworkStack,
  })),
);
const DatabasePanelLazy = lazy(() =>
  import("@/modules/database/DatabasePanel").then((m) => ({ default: m.DatabasePanel })),
);
// Lazy: the resource analyzer is only mounted when its rail item is selected,
// which also stops it polling the Rust sampler on every launch.
const SystemMonitorPanelLazy = lazy(() =>
  import("@/modules/sysmon/SystemMonitorPanel").then((m) => ({
    default: m.SystemMonitorPanel,
  })),
);
const DebuggerPanelLazy = lazy(() =>
  import("@/modules/debugger/DebuggerPanel").then((m) => ({ default: m.DebuggerPanel })),
);
const DebugToolbarLazy = lazy(() =>
  import("@/modules/debugger/DebugToolbar").then((m) => ({ default: m.DebugToolbar })),
);


export default function App() {
  const {
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
    closeAiDiffTab,
    openGitDiffTab,
    openCommitHistoryTab,
    openCommitFileDiffTab,
    openMlNetworkTab,
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
  } = useTabs(getLaunchDir() ? { cwd: getLaunchDir() } : undefined);

  // Mirror `tabs` into a ref so callbacks scheduled with `setTimeout`
  // (e.g. cdInNewTab) read the latest pane state instead of a stale closure.
  // Mirrored after commit, not during render: a render React discards must not
  // leave the ref pointing at tabs that never made it to the screen.
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activeTerminalTab = useMemo(() => {
    const t = tabs.find((x) => x.id === activeId);
    return t && t.kind === "terminal" ? t : null;
  }, [tabs, activeId]);
  const activeLeafId = activeTerminalTab?.activeLeafId ?? null;

  // The LAN share's live push loop runs at module level (sharing survives the
  // panel closing), so it needs a registered way to read the active terminal's
  // buffer rather than a prop.
  useEffect(() => {
    registerShareTerminalBufferProvider(() =>
      activeLeafId !== null
        ? (terminalRefs.current.get(activeLeafId)?.getBuffer(500) ?? null)
        : null,
    );
  }, [activeLeafId]);

  // Editor handles are keyed by leaf id (a tab can host several file panes);
  // the active leaf is the "current" editor for save/format/find/undo.
  const activeEditorTab = useMemo(() => {
    const t = tabs.find((x) => x.id === activeId);
    return t && t.kind === "editor" ? t : null;
  }, [tabs, activeId]);
  const activeEditorLeafId = activeEditorTab?.activeLeafId ?? null;

  const searchAddons = useRef<Map<number, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] =
    useState<GitHistorySearchHandle | null>(null);
  const { zoomIn, zoomOut, zoomReset } = useZoom();
  const explorerRef = useRef<FileExplorerHandle>(null);

  const {
    sidebarRef,
    sidebarWidthRef,
    sidebarView,
    persistSidebarView,
    toggleSidebar,
    cycleSidebarView,
    persistSidebarWidth,
    toggleExplorerFocus,
  } = useSidebarState(explorerRef);

  const {
    shortcutsOpen,
    setShortcutsOpen,
    newEditorOpen,
    setNewEditorOpen,
    quickFilePickerOpen,
    setQuickFilePickerOpen,
    historyLeafId,
    setHistoryLeafId,
    workspaceSearchOpen,
    setWorkspaceSearchOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    workspaceSwitcherOpen,
    setWorkspaceSwitcherOpen,
  } = useDialogCoordinator();

  // Quick terminal: the hotkey registers only in the main window, the dismiss
  // behaviour applies only in the drop-down. Both no-op elsewhere.
  useQuickTerminalHotkey();
  useQuickTerminalDismiss();

  const [home, setHome] = useState<string | null>(null);
  const [pendingCloseTab, setPendingCloseTab] = useState<number | null>(null);
  // Zen mode: hide header + status bar for a distraction-free terminal.
  // Session-only on purpose — restoring a chrome-less window on relaunch
  // with no visible way back would read as breakage.
  //
  // The quick-terminal drop-down (`/?quick=1`) starts in zen mode: it is a
  // borderless overlay summoned by a hotkey, so app chrome would be noise. It
  // stays toggleable from the palette like anywhere else.
  const [zenMode, setZenMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("quick"),
  );
  // A terminal close intercepted because a command is still running (OSC 133
  // in-command). Which close to re-run on confirm is encoded in `kind`.
  const [pendingCloseBusy, setPendingCloseBusy] = useState<
    | { kind: "tab"; id: number }
    | { kind: "pane"; tabId: number }
    | { kind: "leaf"; leafId: number }
    | null
  >(null);
  // Mount the (lazy) settings dialog only once it has been opened, then keep
  // it mounted so the Radix close animation still plays on later closes.
  const settingsOpen = useSettingsDialogStore((s) => s.isOpen);
  // Latched after commit. The render that opens the dialog mounts it via the
  // `settingsOpen ||` short-circuit at the call site, so this only has to be
  // true by the time settings closes again.
  const settingsEverOpenedRef = useRef(false);
  useEffect(() => {
    if (settingsOpen) settingsEverOpenedRef.current = true;
  }, [settingsOpen]);
  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const [launchCwd, setLaunchCwd] = useState<string | null>(null);
  const [launchCwdResolved, setLaunchCwdResolved] = useState(false);
  const [pendingDeleteTabs, setPendingDeleteTabs] = useState<number[] | null>(
    null,
  );
  useEffect(() => {
    homeDir()
      .then(async (p) => {
        // stripVerbatimPrefix: some path sources hand back `\\?\…`, and
        // slash-flipping that prefix yields the unspawnable "//?/…" hybrid
        // (pitfall #23) — it must never become a tab cwd or workspace root.
        const normalized = stripVerbatimPrefix(p).replace(/\\/g, "/");
        setHome(normalized);
        try {
          await native.workspaceAuthorize(normalized);
        } catch {
          // Bootstrap already authorizes home from Rust; ignore.
        }
      })
      .catch(() => setHome(null));
  }, []);

  const switchWorkspace = useCallback(
    async (env: WorkspaceEnv) => {
      if (
        env.kind === workspaceEnv.kind &&
        (env.kind === "local" ||
          (workspaceEnv.kind === "wsl" && env.distro === workspaceEnv.distro))
      ) {
        return;
      }
      const dirty = tabsRef.current.some((t) => t.kind === "editor" && editorAnyDirty(t));
      if (dirty) {
        window.alert("Save or close unsaved editor tabs before switching workspace.");
        return;
      }

      let nextHome: string | null = null;
      try {
        if (env.kind === "wsl") {
          nextHome = await getWslHome(env.distro);
          // The whole switch is rebuilt around this value — it becomes the new
          // terminal tab's cwd, and `pty_open` rejects a cwd it cannot resolve
          // by leaving a terminal with a cursor and no prompt. The backend
          // already refuses a probe answer it cannot parse; refuse anything
          // that isn't a Linux path here too, and say so, rather than resetting
          // the workspace onto it.
          if (!nextHome.startsWith("/")) {
            window.alert(
              `Could not read the home directory of WSL: ${env.distro}.\n\n` +
                `The distro answered with ${JSON.stringify(nextHome)}, which is not a Linux path. ` +
                `If the distro was starting up, try again once it is running.`,
            );
            return;
          }
        } else {
          nextHome = (await homeDir()).replace(/\\/g, "/");
        }
      } catch (e) {
        window.alert(String(e));
        return;
      }

      for (const id of liveLeavesRef.current) disposeSession(id);
      searchAddons.current.clear();
      terminalRefs.current.clear();
      editorRefs.current.clear();
      previewRefs.current.clear();
      setActiveSearchAddon(null);
      setActiveEditorHandle(null);
      setWorkspaceEnv(env.kind === "local" ? LOCAL_WORKSPACE : env);
      setHome(nextHome);
      setLaunchCwd(nextHome);
      if (nextHome) {
        try {
          await native.workspaceAuthorize(nextHome);
        } catch {
          // Non-fatal — git panel will surface "not authorized" if needed.
        }
      }
      resetWorkspace(nextHome ?? undefined);
    },
    [workspaceEnv, setWorkspaceEnv, resetWorkspace],
  );
  useEffect(() => {
    native
      .workspaceCurrentDir()
      .then((dir) => {
        setLaunchCwd(dir);
        if (dir) pushRecentWorkspace(dir);
      })
      .catch(() => setLaunchCwd(null))
      .finally(() => setLaunchCwdResolved(true));
  }, []);

  const switchWorkspacePath = useCallback(
    async (rawPath: string) => {
      // Heal a mangled verbatim prefix ("//?/C:/…", pitfall #23) before the
      // path becomes the workspace root and every new tab's cwd. Older builds
      // stored this exact hybrid in Recent Workspaces.
      const path = stripVerbatimPrefix(rawPath);
      const dirty = tabsRef.current.some((t) => t.kind === "editor" && editorAnyDirty(t));
      if (dirty) {
        window.alert("Save or close unsaved editor tabs before switching workspace.");
        return;
      }
      try {
        await native.workspaceAuthorize(path);
      } catch {
        // Non-fatal — path may already be authorized.
      }
      for (const id of liveLeavesRef.current) disposeSession(id);
      // Send EOF to the REPL if it's running so its PTY exits cleanly.
      // Don't disposeSession — the ReplPanel's onExit handler manages its state.
      sendToRepl("\x04");
      searchAddons.current.clear();
      terminalRefs.current.clear();
      editorRefs.current.clear();
      previewRefs.current.clear();
      setActiveSearchAddon(null);
      setActiveEditorHandle(null);
      // Keep the workspace env in step with the path. Every git/fs IPC call
      // stamps `currentWorkspaceEnv()` onto its payload, so switching to a WSL
      // path while the env still said "local" made the backend run Windows
      // git.exe against a \\wsl.localhost\… UNC path — which reads the Windows
      // .gitconfig, not the distro's, and fails commit with "author identity
      // unknown". switchWorkspaceEnv (above) set this; this path never did.
      // Read the store rather than closing over `workspaceEnv` — that would put
      // a per-render value in the dep array of a callback the whole app holds.
      setWorkspaceEnv(workspaceEnvForPath(path, currentWorkspaceEnv()));
      setLaunchCwd(path);
      pushRecentWorkspace(path);
      resetWorkspace(path);
    },
    [resetWorkspace, setWorkspaceEnv],
  );

  const miniOpen = useChatStore((s) => s.mini.open);
  const openMini = useChatStore((s) => s.openMini);
  const toggleMini = useChatStore((s) => s.toggleMini);
  const focusInput = useChatStore((s) => s.focusInput);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const panelMode = useChatStore((s) => s.panelMode);
  const problemsPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const apiKeys = useChatStore((s) => s.apiKeys);
  const setApiKeys = useChatStore((s) => s.setApiKeys);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const setLive = useChatStore((s) => s.setLive);
  const respondToApproval = useChatStore((s) => s.respondToApproval);
  const lmstudioModelId = usePreferencesStore((s) => s.lmstudioModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const mlxModelId = usePreferencesStore((s) => s.mlxModelId);
  const mlxBaseURL = usePreferencesStore((s) => s.mlxBaseURL);
  const ollamaModelId = usePreferencesStore((s) => s.ollamaModelId);
  const ollamaBaseURL = usePreferencesStore((s) => s.ollamaBaseURL);
  const vllmModelId = usePreferencesStore((s) => s.vllmModelId);
  const vllmBaseURL = usePreferencesStore((s) => s.vllmBaseURL);
  const xllmModelId = usePreferencesStore((s) => s.xllmModelId);
  const xllmBaseURL = usePreferencesStore((s) => s.xllmBaseURL);
  const sglangModelId = usePreferencesStore((s) => s.sglangModelId);
  const sglangBaseURL = usePreferencesStore((s) => s.sglangBaseURL);
  const openaiCompatibleModelId = usePreferencesStore(
    (s) => s.openaiCompatibleModelId,
  );
  const openaiCompatibleBaseURL = usePreferencesStore(
    (s) => s.openaiCompatibleBaseURL,
  );
  const hasLocalModel =
    (lmstudioBaseURL.trim().length > 0 && lmstudioModelId.trim().length > 0) ||
    (mlxBaseURL.trim().length > 0 && mlxModelId.trim().length > 0) ||
    (ollamaBaseURL.trim().length > 0 && ollamaModelId.trim().length > 0) ||
    (vllmBaseURL.trim().length > 0 && vllmModelId.trim().length > 0) ||
    (xllmBaseURL.trim().length > 0 && xllmModelId.trim().length > 0) ||
    (sglangBaseURL.trim().length > 0 && sglangModelId.trim().length > 0) ||
    (openaiCompatibleBaseURL.trim().length > 0 &&
      openaiCompatibleModelId.trim().length > 0);
  const hasComposer = hasAnyKey(apiKeys) || hasLocalModel;

  const [keysLoaded, setKeysLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void getAllKeys().then((keys) => {
        if (!alive) return;
        setApiKeys(keys);
        setKeysLoaded(true);
      });
    };
    reload();
    const unlistenP = onKeysChanged(reload);
    return () => {
      alive = false;
      void unlistenP.then((fn) => fn());
    };
  }, [setApiKeys]);

  // Hydrate the cross-window preference store and mirror the default model
  // into chatStore so the dropdown reflects what the user picked in Settings.
  const initPrefs = usePreferencesStore((s) => s.init);
  const prefDefaultModel = usePreferencesStore((s) => s.defaultModelId);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const prefRestoreTabs = usePreferencesStore((s) => s.restoreTabs);
  useEffect(() => {
    void initPrefs();
  }, [initPrefs]);
  useEffect(() => {
    if (!prefsHydrated) return;
    setSelectedModelId(prefDefaultModel);
  }, [prefsHydrated, prefDefaultModel, setSelectedModelId]);
  // Keep the localStorage restore-tabs flag in sync with the Tauri preference.
  // When disabled, this also clears any saved tab state — and the scrollback
  // snapshots on disk, which are useless without tab restore and would
  // otherwise linger (the exit-time gc only runs while tab restore is on).
  useEffect(() => {
    if (!prefsHydrated) return;
    setSavedTabsEnabled(prefRestoreTabs);
    if (!prefRestoreTabs) void gcSessionSnapshots([]).catch(() => {});
  }, [prefsHydrated, prefRestoreTabs]);

  const hydrateSessions = useChatStore((s) => s.hydrateSessions);
  useEffect(() => {
    void hydrateSessions();
    void useAgentsStore.getState().hydrate();
    void useSnippetsStore.getState().hydrate();
  }, [hydrateSessions]);

  // Wire shell snippet sender — writes to the active terminal
  useEffect(() => {
    setShellSnippetSender((text) => {
      const tab = tabs.find((t) => t.id === activeId && t.kind === "terminal");
      if (!tab || tab.kind !== "terminal") return;
      terminalRefs.current.get(tab.activeLeafId)?.write(text);
    });
  }, [activeId, tabs]);

  useEffect(() => {
    const unlistenP = onThemeEdit(async (req) => {
      try {
        let path: string;
        if (req.action === "create") {
          const theme = starterTheme();
          path = await writeThemeFile(theme);
          await saveCustomTheme(theme);
        } else {
          path = await themeFilePath(req.id);
        }
        openFileTab(path, true);
      } catch (e) {
        console.error("theme-edit:", e);
      }
    });
    return () => {
      void unlistenP.then((fn) => fn());
    };
  }, [openFileTab]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";
  const isPreviewTab = activeTab?.kind === "preview";
  const isMarkdownTab = activeTab?.kind === "markdown";
  const isNotebookTab = activeTab?.kind === "notebook";
  const isImageTab = activeTab?.kind === "image";
  const isAiDiffTab = activeTab?.kind === "ai-diff";
  const isGitDiffTab =
    activeTab?.kind === "git-diff" || activeTab?.kind === "git-commit-file";
  const isGitHistoryTab = activeTab?.kind === "git-history";
  const isMlNetworkTab = activeTab?.kind === "ml-network";

  // When an AI diff is approved (write_file applied to disk), reload any
  // open editor tabs for that path so the user sees the new content. We
  // track which approvalIds we've already handled to fire the reload only
  // once per applied diff.
  const appliedDiffsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const t of tabs) {
      if (t.kind !== "ai-diff") continue;
      if (t.status !== "approved") continue;
      if (appliedDiffsRef.current.has(t.approvalId)) continue;
      appliedDiffsRef.current.add(t.approvalId);
      for (const e of tabs) {
        if (e.kind !== "editor") continue;
        for (const l of editorLeaves(e)) {
          if (l.path === t.path) editorRefs.current.get(l.id)?.reload();
        }
      }
    }
  }, [tabs]);

  // The cleanup below does own the subscription; `listen` returns a Promise, so
  // the unlisten is chained off it rather than called directly, which the rule's
  // static check can't follow. A fast unmount still detaches: the .then fires
  // once the listener is registered and immediately tears it down.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    type FileWrittenPayload = { path: string; source?: string };
    const unlistenPromise = getCurrentWebviewWindow().listen<FileWrittenPayload>(
      "fs:file-written",
      (event) => {
        if (event.payload.source === "editor") return;
        const normalizedPath = event.payload.path.replace(/\\/g, "/");
        pushRecentFile(normalizedPath);
        const currentTabs = tabsRef.current;
        for (const t of currentTabs) {
          if (t.kind !== "editor") continue;
          for (const l of editorLeaves(t)) {
            if (l.path.replace(/\\/g, "/") === normalizedPath) {
              editorRefs.current.get(l.id)?.reload();
            }
          }
        }
      },
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, []);

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(
    activeTab,
    tabs,
    launchCwd ?? home,
  );


  useEffect(() => {
    setActiveSearchAddon(
      activeLeafId !== null ? (searchAddons.current.get(activeLeafId) ?? null) : null,
    );
    setActiveEditorHandle(
      activeEditorLeafId !== null
        ? (editorRefs.current.get(activeEditorLeafId) ?? null)
        : null,
    );
  }, [activeId, activeLeafId, activeEditorLeafId]);

  const handleSearchReady = useCallback(
    (leafId: number, addon: SearchAddon) => {
      searchAddons.current.set(leafId, addon);
      if (leafId === activeLeafId) setActiveSearchAddon(addon);
    },
    [activeLeafId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      // Leaf-keyed maps (terminalRefs/searchAddons/editorRefs) are pruned by
      // the effect below as the pane tree changes; only the tab-id-keyed
      // preview handles need explicit cleanup here.
      previewRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  // Drives session disposal off the pane tree, not React lifecycles —
  // split/unsplit re-mount components but the leaf is still live.
  const liveLeavesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const live = new Set<number>();
    const editorLive = new Set<number>();
    for (const t of tabs) {
      if (t.kind === "terminal") {
        for (const id of leafIds(t.paneTree)) live.add(id);
      } else if (t.kind === "editor") {
        for (const id of leafIds(t.paneTree)) editorLive.add(id);
      }
    }
    for (const id of liveLeavesRef.current) {
      if (!live.has(id)) disposeSession(id);
    }
    liveLeavesRef.current = live;
    for (const k of [...terminalRefs.current.keys()])
      if (!live.has(k)) terminalRefs.current.delete(k);
    for (const k of [...searchAddons.current.keys()])
      if (!live.has(k)) searchAddons.current.delete(k);
    // Editor panes have no session; just prune handles for closed leaves.
    for (const k of [...editorRefs.current.keys()])
      if (!editorLive.has(k)) editorRefs.current.delete(k);
  }, [tabs]);

  const handleClose = useCallback(
    (id: number) => {
      const t = tabs.find((x) => x.id === id);
      if (t?.kind === "editor" && editorAnyDirty(t)) {
        setPendingCloseTab(id);
        return;
      }
      if (
        t?.kind === "terminal" &&
        usePreferencesStore.getState().terminalConfirmCloseBusy &&
        leafIds(t.paneTree).some(sessionHasRunningCommand)
      ) {
        setPendingCloseBusy({ kind: "tab", id });
        return;
      }
      disposeTab(id);
    },
    [tabs, disposeTab],
  );

  const confirmClose = useCallback(() => {
    if (pendingCloseTab !== null) {
      disposeTab(pendingCloseTab);
      setPendingCloseTab(null);
    }
  }, [pendingCloseTab, disposeTab]);

  const cancelClose = useCallback(() => {
    setPendingCloseTab(null);
  }, []);

  const confirmCloseBusy = useCallback(() => {
    if (!pendingCloseBusy) return;
    if (pendingCloseBusy.kind === "tab") disposeTab(pendingCloseBusy.id);
    else if (pendingCloseBusy.kind === "pane")
      closeActivePane(pendingCloseBusy.tabId);
    else closePaneByLeaf(pendingCloseBusy.leafId);
    setPendingCloseBusy(null);
  }, [pendingCloseBusy, disposeTab, closeActivePane, closePaneByLeaf]);

  const cancelCloseBusy = useCallback(() => {
    setPendingCloseBusy(null);
  }, []);

  /** Tab whose terminal the pending busy-close would kill (for dialog text). */
  const busyCloseTab = useMemo(() => {
    if (!pendingCloseBusy) return null;
    if (pendingCloseBusy.kind === "tab")
      return tabs.find((t) => t.id === pendingCloseBusy.id) ?? null;
    if (pendingCloseBusy.kind === "pane")
      return tabs.find((t) => t.id === pendingCloseBusy.tabId) ?? null;
    return (
      tabs.find(
        (t) =>
          t.kind === "terminal" && hasLeaf(t.paneTree, pendingCloseBusy.leafId),
      ) ?? null
    );
  }, [pendingCloseBusy, tabs]);

  // MRU Ctrl+Tab: hold-to-cycle overlay ordered by recency, release-to-select
  // (replaces the old positional next/previous cycle).
  const {
    switcher: tabSwitcher,
    cycle: cycleTab,
    pick: pickSwitcherTab,
  } = useMruTabSwitcher({ tabs, activeId, setActiveId });

  const captureActiveSelection = useCallback((): string | null => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t) return null;
    if (t.kind === "terminal") {
      const lid = t.activeLeafId;
      return terminalRefs.current.get(lid)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(t.activeLeafId)?.getSelection() ?? null;
    }
    return null;
  }, [tabs, activeId]);

  // Sync panel open/mode state with the ResizablePanel imperative API
  const togglePanelAndFocus = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    toggleMini();
  }, [hasComposer, toggleMini]);

  const attachSelection = useChatStore((s) => s.attachSelection);

  const handleAttachFileToAgent = useCallback(
    (path: string) => {
      if (!hasComposer) {
        void openSettingsWindow("models");
        return;
      }
      // Dispatch a window event the composer listens for. Same pattern as
      // selections — keeps file-explorer decoupled from the AI module.
      window.dispatchEvent(
        new CustomEvent<string>("nexis:ai-attach-file", { detail: path }),
      );
      openMini();
      focusInput(null);
    },
    [hasComposer, openMini, focusInput],
  );

  const askFromSelection = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    const selection = captureActiveSelection();
    if (!selection || !selection.trim()) {
      focusInput(null);
      return;
    }
    const source: "terminal" | "editor" =
      activeTab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [
    hasComposer,
    captureActiveSelection,
    focusInput,
    attachSelection,
    activeTab,
  ]);

  const [askPopup, setAskPopup] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const isInsideAi = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      return !!(
        el.closest("[data-selection-ask-ai]") ||
        el.closest("[data-ai-input-bar]") ||
        el.closest("[data-ai-mini-window]")
      );
    };

    const onDown = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      setAskPopup(null);
    };
    // Owned by the effect so unmounting cannot leave a pending timer that
    // wakes up and sets state on a component that is gone.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onUp = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      // Defer one tick so xterm/CodeMirror finalize the selection.
      clearTimeout(settle);
      settle = setTimeout(() => {
        const text = captureActiveSelection();
        if (text && text.trim().length > 0) {
          setAskPopup({ x: e.clientX, y: e.clientY });
        } else {
          setAskPopup(null);
        }
      }, 0);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    return () => {
      clearTimeout(settle);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, [captureActiveSelection]);

  const onAskFromSelection = useCallback(() => {
    askFromSelection();
    setAskPopup(null);
  }, [askFromSelection]);

  const onExplainFromSelection = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    const selection = captureActiveSelection();
    if (!selection || !selection.trim()) return;
    const source: "terminal" | "editor" =
      activeTab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
    openMini();
    window.dispatchEvent(new CustomEvent("nexis:ai-do-submit", { detail: "Explain this:" }));
    setAskPopup(null);
  }, [hasComposer, captureActiveSelection, attachSelection, openMini, activeTab]);

  // Failed-command "✦ Explain" chip (osc-handlers.ts). The terminal only
  // dispatches this window event — the same decoupling as selections — and
  // this bridge attaches the captured command/output as terminal context,
  // then auto-submits a fix-suggestion prompt.
  useEffect(() => {
    const handler = (e: Event) => {
      const failure = (e as CustomEvent<CommandFailure>).detail;
      if (!failure) return;
      if (!hasComposer) {
        void openSettingsWindow("models");
        return;
      }
      const context = [
        `Command (exit code ${failure.exitCode}${failure.cwd ? `, cwd: ${failure.cwd}` : ""}):`,
        failure.command || "(command line unavailable)",
        ...(failure.output ? ["", "Output:", failure.output] : []),
      ].join("\n");
      attachSelection(context, "terminal");
      openMini();
      window.dispatchEvent(
        new CustomEvent("nexis:ai-do-submit", {
          detail:
            "This terminal command failed. Explain what went wrong and suggest a fix.",
        }),
      );
    };
    window.addEventListener("nexis:ai-explain-failure", handler);
    return () => window.removeEventListener("nexis:ai-explain-failure", handler);
  }, [hasComposer, attachSelection, openMini]);

  // Handle LSP go-to-definition cross-file navigation.
  // EditorPane dispatches "nexis:open-file" when definition is in another file.
  useEffect(() => {
    // The pane needs a beat to mount before it can honour a goto; the timer is
    // owned here so an unmount (or a second navigation) cancels it rather than
    // firing into a pane that no longer exists.
    let goto: ReturnType<typeof setTimeout> | undefined;
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ path: string; line?: number }>;
      const { path: targetPath, line } = ev.detail;
      openFileTab(targetPath, true);
      if (line != null) {
        clearTimeout(goto);
        goto = setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("nexis:goto-location", {
              detail: { path: targetPath, line, character: 0 },
            }),
          );
        }, 80);
      }
    };
    window.addEventListener("nexis:open-file", handler);
    return () => {
      clearTimeout(goto);
      window.removeEventListener("nexis:open-file", handler);
    };
  }, [openFileTab]);

  const openNewTab = useCallback(() => {
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const openNewPrivateTab = useCallback(() => {
    newPrivateTab(inheritedCwdForNewTab());
  }, [newPrivateTab, inheritedCwdForNewTab]);

  const sendCd = useCallback(
    (path: string) => {
      if (activeLeafId === null) return;
      const term = terminalRefs.current.get(activeLeafId);
      if (!term) return;
      const quoted = path.includes(" ")
        ? `'${path.replace(/'/g, `'\\''`)}'`
        : path;
      term.write(`cd ${quoted}\r`);
      term.focus();
    },
    [activeLeafId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const tabId = newTab(path);
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        const quoted = path.includes(" ")
          ? `'${path.replace(/'/g, `'\\''`)}'`
          : path;
        t.write(`cd ${quoted}\r`);
        t.focus();
      }, 80);
    },
    [newTab],
  );

  const handleRunFile = useCallback(
    (_path: string, cwd: string, command: string) => {
      const tabId = newTab(cwd);
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        t.write(command.endsWith("\n") ? command.replace(/\n$/, "\r") : `${command}\r`);
        t.focus();
      }, 500);
    },
    [newTab],
  );

  const handleOpenSshSession = useCallback(
    (command: string, label: string) => {
      const tabId = newTab();
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        t.write(`${command}\r`);
        t.focus();
      }, 500);
      void label;
    },
    [newTab],
  );

  const handleOpenFile = useCallback(
    (path: string, pin?: boolean) => {
      pushRecentFile(path);
      // .md / .markdown / .mdx files open as rendered markdown by default.
      // The context-menu "Open" action still passes pin=true to force the
      // editor if the user explicitly wants to edit the raw source.
      if (pin !== true && /\.(md|markdown|mdx)$/i.test(path)) {
        newMarkdownTab(path);
        return;
      }
      // Image files open in the image viewer by default.
      if (pin !== true && /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|tiff?)$/i.test(path)) {
        newImageTab(path);
        return;
      }
      // Explorer defaults to preview (pin=false); explicit actions like
      // context-menu "Open" pass pin=true for a persistent tab.
      openFileTab(path, pin ?? false);
    },
    [openFileTab, newMarkdownTab, newImageTab],
  );

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      // Editor tabs hold paths per pane — remap leaves in one pass.
      renameEditorLeafPaths(from, to);
      // Single-path tab kinds (image, markdown, notebook) stay flat.
      for (const t of tabs) {
        if (
          t.kind !== "image" &&
          t.kind !== "markdown" &&
          t.kind !== "notebook"
        ) continue;
        if (t.path === from) {
          const i = to.lastIndexOf("/");
          updateTab(t.id, { path: to, title: i === -1 ? to : to.slice(i + 1) });
        } else if (t.path.startsWith(`${from}/`)) {
          const suffix = t.path.slice(from.length);
          const newPath = `${to}${suffix}`;
          const i = newPath.lastIndexOf("/");
          updateTab(t.id, {
            path: newPath,
            title: i === -1 ? newPath : newPath.slice(i + 1),
          });
        }
      }
    },
    [tabs, updateTab, renameEditorLeafPaths],
  );

  const confirmDeleteClose = useCallback(() => {
    if (pendingDeleteTabs !== null) {
      for (const id of pendingDeleteTabs) disposeTab(id);
      setPendingDeleteTabs(null);
    }
  }, [pendingDeleteTabs, disposeTab]);

  const cancelDeleteClose = useCallback(() => {
    setPendingDeleteTabs(null);
  }, []);

  const handlePathDeleted = useCallback(
    (path: string) => {
      const dirty: number[] = [];
      for (const t of tabs) {
        // image / markdown / notebook tabs have no dirty state — close them immediately.
        if (t.kind === "image" || t.kind === "markdown" || t.kind === "notebook") {
          if (t.path === path || t.path.startsWith(`${path}/`)) disposeTab(t.id);
          continue;
        }
        if (t.kind !== "editor") continue;
        // Any pane in this tab showing the deleted path (or something under it).
        const affected = editorLeafPaths(t).some(
          (p) => p === path || p.startsWith(`${path}/`),
        );
        if (!affected) continue;
        if (editorAnyDirty(t)) {
          dirty.push(t.id);
        } else {
          disposeTab(t.id);
        }
      }
      if (dirty.length > 0) setPendingDeleteTabs(dirty);
    },
    [tabs, disposeTab],
  );

  const activeTerminalLeafCwd =
    activeTab?.kind === "terminal"
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ??
        activeTab.cwd ??
        null)
      : null;

  const activeFilePath = (() => {
    if (activeTab?.kind === "editor") return editorActivePath(activeTab);
    if (activeTab?.kind === "image") return activeTab.path;
    if (activeTab?.kind === "markdown") return activeTab.path;
    if (activeTab?.kind === "notebook") return activeTab.path;
    if (activeTab?.kind === "git-diff") {
      if (/^([A-Za-z]:|\/|\\)/.test(activeTab.path)) return activeTab.path;
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    if (activeTab?.kind === "git-commit-file") {
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    return null;
  })();
  const workspaceFallbackPath = launchCwdResolved
    ? (launchCwd ?? home ?? null)
    : null;
  const sourceControlContextPath = (() => {
    if (activeTab?.kind === "terminal") {
      return activeTerminalLeafCwd ?? explorerRoot ?? workspaceFallbackPath;
    }
    if (activeTab?.kind === "editor") return dirname(editorActivePath(activeTab));
    if (activeTab?.kind === "git-diff") return activeTab.repoRoot;
    if (activeTab?.kind === "git-commit-file") return activeTab.repoRoot;
    if (activeTab?.kind === "git-history") return activeTab.repoRoot;
    return explorerRoot ?? workspaceFallbackPath;
  })();
  const hasOpenGitTab = useMemo(
    () =>
      tabs.some(
        (t) =>
          t.kind === "git-diff" ||
          t.kind === "git-history" ||
          t.kind === "git-commit-file",
      ),
    [tabs],
  );
  const sourceControlActive =
    hasOpenGitTab || sidebarView === "source-control";
  // Stable per-session path so switching tabs / cd-ing in a shell does NOT
  // re-fire git IPC for the badge. The active panel resolves the current
  // context path on its own when the user actually opens git.
  const badgeContextPath = workspaceFallbackPath;
  const sourceControlPath = sourceControlActive
    ? sourceControlContextPath
    : badgeContextPath;
  const sourceControl = useSourceControl(sourceControlPath, true);

  const toggleSourceControl = useCallback(() => {
    cycleSidebarView("source-control");
  }, [cycleSidebarView]);

  const { processes: bgProcesses } = useBackgroundProcesses(5000);
  const runningProcessCount = bgProcesses.filter((p) => !p.exited).length;

  const openGitGraphFromContext = useCallback(async () => {
    const known = sourceControl.hasRepo ? sourceControl.repo : null;
    if (known) {
      openCommitHistoryTab({
        repoRoot: known.repoRoot,
        branch: sourceControl.status?.branch ?? null,
      });
      return;
    }
    if (!sourceControlContextPath) return;
    try {
      const repo = await native.gitResolveRepo(sourceControlContextPath);
      if (!repo) return;
      openCommitHistoryTab({ repoRoot: repo.repoRoot, branch: repo.branch });
    } catch {
      /* noop */
    }
  }, [
    openCommitHistoryTab,
    sourceControl.hasRepo,
    sourceControl.repo,
    sourceControl.status?.branch,
    sourceControlContextPath,
  ]);

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      // Focus the address bar if the URL is empty so the user can type.
      if (!url) {
        setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
      }
      return id;
    },
    [newPreviewTab],
  );

  const openMarkdownPreview = useCallback(
    (path: string) => {
      newMarkdownTab(path);
    },
    [newMarkdownTab],
  );

  const openNotebookViewer = useCallback(
    (path: string) => {
      newNotebookTab(path);
    },
    [newNotebookTab],
  );

  const openImageViewer = useCallback(
    (path: string) => {
      newImageTab(path);
    },
    [newImageTab],
  );

  // Pane split/move/focus dispatch to the terminal or editor variant based on
  // the active tab kind, so the same shortcuts drive both.
  const splitActivePaneInActiveTab = useCallback(
    (dir: "row" | "col") => {
      const t = tabsRef.current.find((x) => x.id === activeId);
      if (t?.kind === "terminal") splitActivePane(activeId, dir);
      else if (t?.kind === "editor") splitActiveEditorPane(activeId, dir);
    },
    [activeId, splitActivePane, splitActiveEditorPane],
  );

  const movePaneInActiveTab = useCallback(
    (axis: "row" | "col", delta: 1 | -1) => {
      const t = tabsRef.current.find((x) => x.id === activeId);
      if (t?.kind === "terminal") movePaneInTab(activeId, axis, delta);
      else if (t?.kind === "editor") moveEditorPaneInTab(activeId, axis, delta);
    },
    [activeId, movePaneInTab, moveEditorPaneInTab],
  );

  const focusNextPaneInActiveTab = useCallback(
    (delta: 1 | -1) => {
      const t = tabsRef.current.find((x) => x.id === activeId);
      if (t?.kind === "terminal") focusNextPaneInTab(activeId, delta);
      else if (t?.kind === "editor") focusNextEditorPane(activeId, delta);
    },
    [activeId, focusNextPaneInTab, focusNextEditorPane],
  );

  const paletteCommands = useMemo<CommandDef[]>(() => [
    { id: "tab.new",             label: "New terminal tab",         category: "Tabs",    action: () => newTab() },
    { id: "tab.close",           label: "Close current tab",        category: "Tabs",    action: () => closeTab(activeId) },
    { id: "files.quickOpen",     label: "Quick file open",          category: "Files",   action: () => setQuickFilePickerOpen(true), keywords: ["cmd+p", "go to file"] },
    { id: "search.workspace",    label: "Find & replace in project",category: "Search",  action: () => setWorkspaceSearchOpen(true), keywords: ["grep", "search"] },
    { id: "sidebar.toggle",      label: "Toggle sidebar",           category: "View",    action: toggleSidebar },
    { id: "settings.open",       label: "Open settings",            category: "General", action: () => void openSettingsWindow() },
    { id: "settings.themes",     label: "Open theme settings",      category: "General", action: () => void openSettingsWindow("themes") },
    { id: "settings.shortcuts",  label: "Open keyboard shortcuts",  category: "General", action: () => setShortcutsOpen(true) },
    { id: "window.new",          label: "New window",               category: "General", action: () => void openNewWindow() },
    { id: "ai.toggle",           label: "Toggle AI panel",          category: "AI",      action: togglePanelAndFocus },
    { id: "terminal.aiCommand",  label: "AI command search",        category: "AI",      action: () => window.dispatchEvent(new CustomEvent("nexis:terminal-ai-command")), keywords: ["natural language", "generate command"] },
    { id: "view.zoomIn",         label: "Zoom in",                  category: "View",    action: zoomIn },
    { id: "view.zoomOut",        label: "Zoom out",                 category: "View",    action: zoomOut },
    { id: "view.zoomReset",      label: "Reset zoom",               category: "View",    action: zoomReset },
    { id: "view.zenMode",        label: "Toggle zen mode",          category: "View",    action: () => setZenMode((v) => !v), keywords: ["distraction free", "hide header"] },
    { id: "pane.splitRight",     label: "Split pane right",         category: "Panes",   action: () => splitActivePaneInActiveTab("row") },
    { id: "pane.splitDown",      label: "Split pane down",          category: "Panes",   action: () => splitActivePaneInActiveTab("col") },
    { id: "sidebar.explorer",    label: "Show file explorer",       category: "View",    action: () => persistSidebarView("explorer") },
    { id: "sidebar.sc",          label: "Show source control",      category: "View",    action: () => persistSidebarView("source-control") },
    { id: "sidebar.processes",   label: "Show activity (processes + agent queue)",category: "View",    action: () => persistSidebarView("processes"), pack: "dev-tools" },
    { id: "sidebar.sysmon",      label: "Show system monitor (CPU, memory, processes)", category: "View", action: () => persistSidebarView("system-monitor"), pack: "dev-tools" },
  ], [newTab, closeTab, activeId, setQuickFilePickerOpen, setWorkspaceSearchOpen, toggleSidebar, setShortcutsOpen, togglePanelAndFocus, zoomIn, zoomOut, zoomReset, splitActivePaneInActiveTab, persistSidebarView]);

  // Commands owned by a disabled expansion pack disappear from the palette,
  // mirroring how the rail hides their views (V2 gating; decision doc in
  // docs/vault/decisions/expansion-packs.md).
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const visiblePaletteCommands = useMemo(
    () => paletteCommands.filter((c) => packEnabled(c.pack, enabledPacks)),
    [paletteCommands, enabledPacks],
  );

  const handleCloseTabOrPane = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeId);
    if (t?.kind === "terminal" && leafIds(t.paneTree).length > 1) {
      if (
        usePreferencesStore.getState().terminalConfirmCloseBusy &&
        sessionHasRunningCommand(t.activeLeafId)
      ) {
        setPendingCloseBusy({ kind: "pane", tabId: activeId });
        return;
      }
      closeActivePane(activeId);
      return;
    }
    handleClose(activeId);
  }, [activeId, closeActivePane, handleClose]);

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "tab.new": openNewTab,
      "tab.newPrivate": openNewPrivateTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseTabOrPane,
      "tab.next": (e) => cycleTab(1, e),
      "tab.prev": (e) => cycleTab(-1, e),
      "tab.selectByIndex": (e) => selectByIndex(parseInt(e.key, 10) - 1),
      "pane.splitRight": () => splitActivePaneInActiveTab("row"),
      "pane.splitDown": () => splitActivePaneInActiveTab("col"),
      "pane.focusNext": () => focusNextPaneInActiveTab(1),
      "pane.focusPrev": () => focusNextPaneInActiveTab(-1),
      "pane.moveUp": () => movePaneInActiveTab("col", -1),
      "pane.moveDown": () => movePaneInActiveTab("col", 1),
      "pane.moveLeft": () => movePaneInActiveTab("row", -1),
      "pane.moveRight": () => movePaneInActiveTab("row", 1),
      "pane.source": toggleSourceControl,
      "search.focus": () => searchInlineRef.current?.focus(),
      "ai.toggle": togglePanelAndFocus,
      "ai.askSelection": askFromSelection,
      "terminal.aiCommand": () =>
        window.dispatchEvent(new CustomEvent("nexis:terminal-ai-command")),
      "repl.sendSelection": () => {
        const sel = captureActiveSelection();
        if (sel) {
          persistSidebarView("repl");
          sendToRepl(sel + "\r");
        }
      },
      "refactor.captureSelection": () => {
        const sel = captureActiveSelection();
        if (sel) {
          persistSidebarView("refactor");
          setRefactorCode(sel);
        }
      },
      "bookmark.toggle": () => {
        const tab = tabs.find((t) => t.id === activeId);
        if (!tab || tab.kind !== "editor") return;
        const handle = editorRefs.current.get(tab.activeLeafId);
        const line = handle?.getCursorLine?.() ?? 0;
        toggleBookmark(editorActivePath(tab), line);
      },
      "files.quickOpen": () => setQuickFilePickerOpen((v) => !v),
      "search.workspace": () => setWorkspaceSearchOpen((v) => !v),
      "commands.palette": () => setCommandPaletteOpen((v) => !v),
      "workspace.switch": () => setWorkspaceSwitcherOpen((v) => !v),
      "shortcuts.open": () => setShortcutsOpen((v) => !v),
      "window.new": () => void openNewWindow(),
      "settings.open": () => void openSettingsWindow(),
      "sidebar.toggle": toggleSidebar,
      "explorer.focus": toggleExplorerFocus,
      "view.zoomIn": zoomIn,
      "view.zoomOut": zoomOut,
      "view.zoomReset": zoomReset,
      "view.zenMode": () => setZenMode((v) => !v),
      "editor.formatDocument": () => {
        if (activeEditorLeafId !== null)
          void editorRefs.current.get(activeEditorLeafId)?.format();
      },
      "editor.codeActions": () => {
        if (activeEditorLeafId !== null)
          editorRefs.current.get(activeEditorLeafId)?.openCodeActions();
      },
      "editor.goToLine": () => {
        if (activeEditorLeafId !== null)
          editorRefs.current.get(activeEditorLeafId)?.openGotoLine();
      },
      "editor.undo": () =>
        activeEditorLeafId !== null &&
        editorRefs.current.get(activeEditorLeafId)?.undo(),
      "editor.redo": () =>
        activeEditorLeafId !== null &&
        editorRefs.current.get(activeEditorLeafId)?.redo(),
    }),
    [
      activeId,
      activeEditorLeafId,
      cycleTab,
      handleCloseTabOrPane,
      openNewTab,
      openNewPrivateTab,
      openPreviewTab,
      selectByIndex,
      splitActivePaneInActiveTab,
      movePaneInActiveTab,
      focusNextPaneInActiveTab,
      toggleSourceControl,
      togglePanelAndFocus,
      askFromSelection,
      toggleSidebar,
      toggleExplorerFocus,
      zoomIn,
      zoomOut,
      zoomReset,
      // `tabs` and `captureActiveSelection` were the ones that mattered:
      // `bookmark.toggle` looks the active tab up in `tabs`, and the repl and
      // refactor handlers read the live selection. Held to the render that
      // built them, both went stale as soon as a tab was opened or closed —
      // "toggle bookmark" then found nothing on a tab opened since. The rest
      // are stable identities, listed so the set is honest.
      tabs,
      captureActiveSelection,
      persistSidebarView,
      setNewEditorOpen,
      setQuickFilePickerOpen,
      setWorkspaceSearchOpen,
      setCommandPaletteOpen,
      setWorkspaceSwitcherOpen,
      setShortcutsOpen,
      setZenMode,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      if (
        id === "editor.undo" ||
        id === "editor.redo" ||
        id === "editor.formatDocument" ||
        id === "editor.codeActions" ||
        id === "editor.goToLine"
      ) {
        return activeTab?.kind !== "editor";
      }
      if (id === "ai.askSelection") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        const inTerminal = !!(target as HTMLElement | null)?.closest?.(
          ".xterm",
        );
        if (!inTerminal) return false;
        const sel = captureActiveSelection();
        return !sel || !sel.trim();
      }
      return false;
    },
    [activeTab, captureActiveSelection],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  const registerTerminalHandle = useCallback(
    (leafId: number, h: TerminalPaneHandle | null) => {
      if (h) terminalRefs.current.set(leafId, h);
      else terminalRefs.current.delete(leafId);
    },
    [],
  );

  const registerEditorHandle = useCallback(
    (leafId: number, h: EditorPaneHandle | null) => {
      if (h) editorRefs.current.set(leafId, h);
      else editorRefs.current.delete(leafId);
      if (leafId === activeEditorLeafId) setActiveEditorHandle(h);
    },
    [activeEditorLeafId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) previewRefs.current.set(id, h);
      else previewRefs.current.delete(id);
    },
    [],
  );

  const handlePreviewUrl = useCallback(
    (id: number, url: string) => updateTab(id, { url }),
    [updateTab],
  );

  const handleTerminalCwd = useCallback(
    (leafId: number, cwd: string) => setLeafCwd(leafId, cwd),
    [setLeafCwd],
  );

  const handleTerminalTitle = useCallback(
    (leafId: number, title: string) => setLeafOscTitle(leafId, title),
    [setLeafOscTitle],
  );

  const handleFocusLeaf = useCallback(
    (tabId: number, leafId: number) => focusPane(tabId, leafId),
    [focusPane],
  );

  const handleLeafExit = useCallback(
    (leafId: number, _code: number) => {
      const all = tabsRef.current;
      const tab = all.find(
        (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
      );
      if (!tab || tab.kind !== "terminal") return;
      const isLast =
        leafIds(tab.paneTree).length === 1 &&
        all.filter((t) => t.kind === "terminal").length === 1;
      if (isLast) {
        void respawnSession(leafId, tab.cwd);
      } else {
        closePaneByLeaf(leafId);
      }
    },
    [closePaneByLeaf],
  );

  const handleClosePane = useCallback(
    (leafId: number) => {
      if (
        usePreferencesStore.getState().terminalConfirmCloseBusy &&
        sessionHasRunningCommand(leafId)
      ) {
        setPendingCloseBusy({ kind: "leaf", leafId });
        return;
      }
      closePaneByLeaf(leafId);
    },
    [closePaneByLeaf],
  );

  const handleEditorDirty = useCallback(
    (leafId: number, dirty: boolean) => setEditorLeafDirty(leafId, dirty),
    [setEditorLeafDirty],
  );

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeLeafId !== null && activeSearchAddon)
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => terminalRefs.current.get(activeLeafId)?.focus(),
      };
    if (isEditorTab && activeEditorHandle)
      return {
        kind: "editor",
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    if (isGitHistoryTab && gitHistoryHandle)
      return {
        kind: "git-history",
        handle: gitHistoryHandle,
        focus: () => {},
      };
    return null;
  }, [
    isTerminalTab,
    isEditorTab,
    isGitHistoryTab,
    activeLeafId,
    activeSearchAddon,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  const activeCwd = activeTerminalLeafCwd;

  useEffect(() => {
    const findCwd = () => {
      const active = tabs.find((x) => x.id === activeId);
      if (active?.kind === "terminal") {
        return findLeafCwd(active.paneTree, active.activeLeafId) ?? active.cwd ?? null;
      }
      for (let i = tabs.length - 1; i >= 0; i--) {
        const t = tabs[i];
        if (t.kind !== "terminal") continue;
        const cwd = findLeafCwd(t.paneTree, t.activeLeafId) ?? t.cwd;
        if (cwd) return cwd;
      }
      return explorerRoot ?? launchCwd ?? home ?? null;
    };

    setLive({
      getCwd: findCwd,
      getTerminalContext: () => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "terminal") return null;
        if (t.private) return null;
        const buf = terminalRefs.current.get(t.activeLeafId)?.getBuffer(300);
        return buf ? redactSensitive(buf) : null;
      },
      isActiveTerminalPrivate: () => {
        const t = tabs.find((x) => x.id === activeId);
        return t?.kind === "terminal" && t.private === true;
      },
      injectIntoActivePty: (text) => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "terminal") return false;
        const term = terminalRefs.current.get(t.activeLeafId);
        if (!term) return false;
        term.write(text);
        term.focus();
        return true;
      },
      getWorkspaceRoot: () => explorerRoot ?? launchCwd ?? home ?? null,
      getActiveFile: () => {
        const t = tabs.find((x) => x.id === activeId);
        return t?.kind === "editor" ? editorActivePath(t) : null;
      },
      openPreview: (url: string) => {
        openPreviewTab(url);
        return true;
      },
    });
  }, [setLive, activeId, tabs, explorerRoot, launchCwd, home, openPreviewTab]);

  const workspaceSurface = tabs.length === 0 ? (
    <WelcomeScreen onNewTerminal={openNewTab} />
  ) : (
    <div className="relative h-full min-h-0">
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isTerminalTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isTerminalTab}
      >
        <TerminalStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerTerminalHandle}
          onSearchReady={handleSearchReady}
          onCwd={handleTerminalCwd}
          onTitle={handleTerminalTitle}
          onExit={handleLeafExit}
          onFocusLeaf={handleFocusLeaf}
          onClosePane={handleClosePane}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isEditorTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isEditorTab}
      >
        <EditorStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerEditorHandle}
          onDirtyChange={handleEditorDirty}
          onCloseLeaf={closeEditorPaneByLeaf}
          onFocusLeaf={focusEditorPane}
          onRunFile={handleRunFile}
          root={explorerRoot}
          onNavigateToFolder={(_folderPath) => {
            persistSidebarView("explorer");
          }}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isPreviewTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isPreviewTab}
      >
        <PreviewStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerPreviewHandle}
          onUrlChange={handlePreviewUrl}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isMarkdownTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isMarkdownTab}
      >
        <Suspense fallback={null}><MarkdownStackLazy tabs={tabs} activeId={activeId} /></Suspense>
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isNotebookTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isNotebookTab}
      >
        <Suspense fallback={null}><NotebookStackLazy tabs={tabs} activeId={activeId} /></Suspense>
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isImageTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isImageTab}
      >
        <Suspense fallback={null}><ImageStackLazy tabs={tabs} activeId={activeId} /></Suspense>
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isAiDiffTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isAiDiffTab}
      >
        <AiDiffStack
          tabs={tabs}
          activeId={activeId}
          onAccept={(id) => respondToApproval(id, true)}
          onReject={(id) => respondToApproval(id, false)}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isGitDiffTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitDiffTab}
      >
        <GitDiffStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isGitHistoryTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitHistoryTab}
      >
        <GitHistoryStack
          tabs={tabs}
          activeId={activeId}
          onOpenCommitFile={openCommitFileDiffTab}
          onSearchHandle={setGitHistoryHandle}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isMlNetworkTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isMlNetworkTab}
      >
        <Suspense fallback={null}>
          <MlNetworkStackLazy
            tabs={tabs}
            activeId={activeId}
            onCollapse={closeTab}
          />
        </Suspense>
      </div>
    </div>
  );

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          {/* Outside .zoom-content on purpose — CSS zoom would scale the
              fixed-position hit strips away from the real window edges. */}
          <WindowResizeEdges />
          {/* display:none (not unmount) so header search state and the
              SearchInline ref survive toggling zen. */}
          <div className={zenMode ? "hidden" : "contents"}>
          <Header
            tabs={tabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={openNewTab}
            onNewPrivate={openNewPrivateTab}
            onNewPreview={() => openPreviewTab("")}
            onNewEditor={() => setNewEditorOpen(true)}
            onNewGitGraph={openGitGraphFromContext}
            onNewWindow={() => void openNewWindow()}
            onClose={handleClose}
            onPin={pinTab}
            onReorder={reorderTabs}
            onToggleSidebar={toggleSidebar}
            onSplit={splitActivePaneInActiveTab}
            canSplit={
              (activeTerminalTab !== null &&
                leafIds(activeTerminalTab.paneTree).length < MAX_PANES_PER_TAB) ||
              (activeEditorTab !== null &&
                leafIds(activeEditorTab.paneTree).length < MAX_PANES_PER_TAB)
            }
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => void openSettingsWindow()}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
          />
          </div>

          <main className="zoom-content flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
            >
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarRef}
                defaultSize={`${sidebarWidthRef.current}px`}
                minSize={`${SIDEBAR_MIN_WIDTH}px`}
                maxSize={`${SIDEBAR_MAX_WIDTH}px`}
                collapsible
                collapsedSize={0}
                onResize={(size) => {
                  if (size.inPixels > 0) persistSidebarWidth(size.inPixels);
                }}
              >
                <div className="flex h-full min-h-0 flex-col border-r border-border/60 bg-card">
                  <div className="min-h-0 flex-1">
                    <ErrorBoundary>
                    {isPluginPanelViewId(sidebarView) ? (
                      // Registry-contributed panel (expansion packs V2). The
                      // slot owns its own gated/missing states, since a
                      // contribution's pack lives on the contribution rather
                      // than in the built-in view→pack map.
                      <PluginPanelSlot
                        view={sidebarView}
                        onShowExplorer={() => persistSidebarView("explorer")}
                      />
                    ) : !viewEnabled(sidebarView, enabledPacks) ? (
                      // The active view's pack is disabled (settings toggle,
                      // preset, or a decoupled open request for a gated
                      // view): offer to enable the pack in place instead of
                      // silently snapping back to the explorer.
                      <PackGatePlaceholder
                        view={sidebarView}
                        onShowExplorer={() => persistSidebarView("explorer")}
                      />
                    ) : sidebarView === "recent-files" ? (
                      <RecentFilesPanel onOpenFile={handleOpenFile} />
                    ) : sidebarView === "explorer" ? (
                      <FileExplorer
                        ref={explorerRef}
                        rootPath={explorerRoot}
                        onOpenFile={handleOpenFile}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={cdInNewTab}
                        onAttachToAgent={handleAttachFileToAgent}
                        onOpenMarkdownPreview={openMarkdownPreview}
                        onOpenNotebook={openNotebookViewer}
                        onOpenImage={openImageViewer}
                      />
                    ) : sidebarView === "processes" ? (
                      <ActivityPanel />
                    ) : sidebarView === "system-monitor" ? (
                      <Suspense fallback={null}><SystemMonitorPanelLazy /></Suspense>
                    ) : sidebarView === "ports" ? (
                      <PortsPanel onOpenPreview={openPreviewTab} />
                    ) : sidebarView === "repl" ? (
                      <ReplPanel />
                    ) : sidebarView === "profiles" ? (
                      <ProfilesPanel
                        currentPath={launchCwd}
                        onActivate={({ profile, startupCommand }) => {
                          void switchWorkspacePath(profile.rootPath).then(() => {
                            // Apply profile env vars to future terminal sessions
                            if (Object.keys(profile.envVars).length > 0) {
                              void setTerminalEnvVars(profile.envVars);
                            }
                            // Inject startup command into the active terminal if present
                            if (startupCommand) {
                              const t = tabsRef.current.find((x) => x.kind === "terminal");
                              if (t && t.kind === "terminal") {
                                const term = terminalRefs.current.get(t.activeLeafId);
                                if (term) term.write(`${startupCommand}\r`);
                              }
                            }
                          });
                        }}
                      />
                    ) : sidebarView === "outline" ? (
                      <SymbolOutlinePanel filePath={activeEditorTab ? editorActivePath(activeEditorTab) : null} />
                    ) : sidebarView === "snippets" ? (
                      <SnippetsPanel />
                    ) : sidebarView === "tests" ? (
                      <TestRunnerPanel workspaceRoot={explorerRoot} />
                    ) : sidebarView === "database" ? (
                      <Suspense fallback={null}><DatabasePanelLazy /></Suspense>
                    ) : sidebarView === "build" ? (
                      <BuildPanel workspaceRoot={explorerRoot} />
                    ) : sidebarView === "code-review" ? (
                      <CodeReviewPanel workspaceRoot={explorerRoot} />
                    ) : sidebarView === "agent-queue" ? (
                      <ActivityPanel />
                    ) : sidebarView === "symbol-search" ? (
                      <SymbolSearchPanel
                        workspaceRoot={explorerRoot}
                        onOpenFile={(path) => {
                          openFileTab(path, true);
                        }}
                      />
                    ) : sidebarView === "refactor" ? (
                      <RefactorPanel />
                    ) : sidebarView === "share" ? (
                      <SharePanel />
                    ) : sidebarView === "prompt-templates" ? (
                      <PromptTemplatesPanel />
                    ) : sidebarView === "bookmarks" ? (
                      <BookmarksPanel
                        onNavigate={(path, line) => {
                          openFileTab(path, true);
                          // Editor will scroll to line via the editor's own scroll-to mechanism
                          // when the file opens; line is advisory for now
                          void line;
                        }}
                      />
                    ) : sidebarView === "shell-snippets" ? (
                      <ShellSnippetsPanel />
                    ) : sidebarView === "notes" ? (
                      <WorkspaceNotesPanel workspaceRoot={explorerRoot} />
                    ) : sidebarView === "ssh" ? (
                      <SshPanel onConnect={handleOpenSshSession} />
                    ) : sidebarView === "debugger" ? (
                      <div className="flex h-full flex-col">
                        <div className="flex shrink-0 items-center border-b border-border/40 px-1 py-1">
                          <Suspense fallback={null}><DebugToolbarLazy /></Suspense>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <Suspense fallback={null}><DebuggerPanelLazy /></Suspense>
                        </div>
                      </div>
                    ) : sidebarView === "release" ? (
                      <ReleasePanel workspaceRoot={explorerRoot} />
                    ) : sidebarView === "ml" ? (
                      <Suspense fallback={null}>
                          <MlPanelLazy
                            workspaceRoot={explorerRoot}
                            onOpenNetworkTab={openMlNetworkTab}
                          />
                        </Suspense>
                    ) : (
                      <SourceControlPanel
                        open
                        sourceControl={sourceControl}
                        onOpenDiff={openGitDiffTab}
                        onOpenGitGraph={openGitGraphFromContext}
                        onOpenWorktree={(path) => void switchWorkspacePath(path)}
                      />
                    )}
                    </ErrorBoundary>
                  </div>
                  <SidebarRail
                    activeView={sidebarView}
                    onSelectView={persistSidebarView}
                    changedCount={sourceControl.changedCount}
                    runningProcessCount={runningProcessCount || undefined}
                    onOpenHistory={openGitGraphFromContext}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
                <ResizablePanelGroup orientation="vertical" className="h-full">
                  <ResizablePanel id="workspace-main" minSize="20%">
                    <ErrorBoundary>{workspaceSurface}</ErrorBoundary>
                  </ResizablePanel>

                  {problemsOpen && (
                    <>
                      <ResizableHandle withHandle />
                      <ResizablePanel
                        id="problems-panel"
                        panelRef={problemsPanelRef}
                        collapsible
                        collapsedSize={0}
                        defaultSize="180px"
                        minSize="80px"
                        maxSize="50%"
                        onResize={(size) => {
                          if (size.inPixels === 0) setProblemsOpen(false);
                        }}
                      >
                        <ProblemsPanel
                          onNavigate={(path, line, character) => {
                            openFileTab(path, true);
                            // Brief delay so the editor has time to mount
                            setTimeout(() => {
                              window.dispatchEvent(
                                new CustomEvent("nexis:goto-location", {
                                  detail: { path, line, character },
                                }),
                              );
                            }, 80);
                          }}
                        />
                      </ResizablePanel>
                    </>
                  )}

                </ResizablePanelGroup>

                {/* Floating panel overlay — rendered when panelMode === "floating" */}
                {keysLoaded && panelOpen && panelMode === "floating" && hasComposer && (
                  <FloatingAiPanel />
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>

          <div className={zenMode ? "hidden" : "contents"}>
          <StatusBar
            cwd={activeCwd}
            filePath={activeFilePath}
            home={home}
            onCd={sendCd}
            onWorkspaceChange={switchWorkspace}
            onOpenMini={openMini}
            hasComposer={hasComposer}
            privateActive={
              activeTab?.kind === "terminal" && activeTab.private === true
            }
            problemsOpen={problemsOpen}
            onToggleProblems={() => setProblemsOpen((v) => !v)}
          />
          </div>

          {hasComposer ? (
            <AgentRunBridge
              openAiDiffTab={openAiDiffTab}
              closeAiDiffTab={closeAiDiffTab}
            />
          ) : null}

          {/* Activates all first-party plugins (status bar items, panels, etc.) */}
          <PluginHost />

          {/* One-time expansion-pack preset picker (Settings → Features later) */}
          <PackOnboardingDialog />

          {miniOpen && hasComposer ? <AiMiniWindow key="ai-mini" /> : null}
          {askPopup ? (
            <SelectionAskAi
              key="ask-ai-popup"
              x={askPopup.x}
              y={askPopup.y}
              onAsk={onAskFromSelection}
              onExplain={onExplainFromSelection}
              onDismiss={() => setAskPopup(null)}
            />
          ) : null}

          {quickFilePickerOpen && (
            <QuickFilePicker
              root={explorerRoot}
              onSelect={(path) => openFileTab(path)}
              onClose={() => setQuickFilePickerOpen(false)}
            />
          )}

          {workspaceSwitcherOpen && (
            <WorkspaceSwitcher
              currentPath={launchCwd}
              onSelect={(path) => void switchWorkspacePath(path)}
              onClose={() => setWorkspaceSwitcherOpen(false)}
            />
          )}

          {workspaceSearchOpen && (
            <WorkspaceSearch
              root={explorerRoot}
              onOpenFile={(path) => { openFileTab(path); }}
              onClose={() => setWorkspaceSearchOpen(false)}
            />
          )}

          {commandPaletteOpen && (
            <CommandPalette
              commands={visiblePaletteCommands}
              onClose={() => setCommandPaletteOpen(false)}
            />
          )}

          {tabSwitcher && (
            <TabSwitcher
              tabs={tabs}
              order={tabSwitcher.order}
              index={tabSwitcher.index}
              onPick={pickSwitcherTab}
            />
          )}

          {historyLeafId !== null && (
            <ShellHistoryOverlay
              leafId={historyLeafId}
              onClose={() => setHistoryLeafId(null)}
            />
          )}

          <ShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />

          {(settingsOpen || settingsEverOpenedRef.current) && (
            <Suspense fallback={null}>
              <SettingsDialogLazy />
            </Suspense>
          )}

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

          <UpdaterDialog />

          <AlertDialog
            open={pendingCloseTab !== null}
            onOpenChange={(open) => !open && cancelClose()}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
                <AlertDialogDescription>
                  {tabs.find((t) => t.id === pendingCloseTab)?.title
                    ? `"${
                        tabs.find((t) => t.id === pendingCloseTab)?.title
                      }" has unsaved changes. Close anyway?`
                    : "This file has unsaved changes. Close anyway?"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelClose}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmClose}>
                  Close Anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={pendingCloseBusy !== null}
            onOpenChange={(open) => !open && cancelCloseBusy()}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Process Still Running</AlertDialogTitle>
                <AlertDialogDescription>
                  {busyCloseTab
                    ? `A command is still running in "${labelFor(busyCloseTab)}". Closing will kill it. Close anyway?`
                    : "A command is still running in this terminal. Closing will kill it. Close anyway?"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelCloseBusy}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmCloseBusy}>
                  Close Anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={pendingDeleteTabs !== null}
            onOpenChange={(open) => !open && cancelDeleteClose()}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingDeleteTabs?.length === 1
                    ? (() => {
                        const title = tabs.find(
                          (t) => t.id === pendingDeleteTabs[0],
                        )?.title;
                        return title
                          ? `"${title}" has unsaved changes. The file has been deleted. Close anyway?`
                          : "This file has unsaved changes. The file has been deleted. Close anyway?";
                      })()
                    : `${pendingDeleteTabs?.length ?? 0} files have unsaved changes. They have been deleted. Close all anyway?`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelDeleteClose}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteClose}>
                  Close Anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );

  return <AiComposerProvider>{shell}</AiComposerProvider>;
}
