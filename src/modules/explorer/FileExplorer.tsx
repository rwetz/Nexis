// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { listen } from "@tauri-apps/api/event";
import { native } from "@/modules/ai/lib/native";
import { AnimatedFolder } from "@/components/ui/AnimatedFolder";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  FileAddIcon,
  FolderAddIcon,
  Refresh01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { getFolderColor, useTheme } from "@/modules/theme";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ExplorerSearch, type ExplorerSearchHandle } from "./ExplorerSearch";
import { EntryRow, PendingRow, StatusRow } from "./TreeRow";
import { InlineInput } from "./InlineInput";
import { canMoveInto, type ExplorerDrag, moveTargetDir } from "./lib/dnd";
import { copyToClipboard, revealInFinder } from "./lib/contextActions";
import { fileIconUrl, folderIconUrl, preloadIcons } from "./lib/iconResolver";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { useFileTree } from "./lib/useFileTree";
import { useGlobalShortcuts } from "@/modules/shortcuts";
import { basename } from "@/lib/path";

export type FileExplorerHandle = {
  focus: () => void;
  isFocused: () => boolean;
};

type Props = {
  rootPath: string | null;
  onOpenFile: (path: string, pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
  onOpenMarkdownPreview?: (path: string) => void;
  onOpenNotebook?: (path: string) => void;
  onOpenImage?: (path: string) => void;
};

type Row =
  | {
      kind: "entry";
      key: string;
      path: string;
      name: string;
      isDir: boolean;
      isExpanded: boolean;
      depth: number;
    }
  | { kind: "rename"; key: string; path: string; name: string; isDir: boolean; depth: number }
  | { kind: "pending"; key: string; depth: number; pendingKind: "file" | "dir" }
  | { kind: "status"; key: string; depth: number; tone: "muted" | "error"; message: string };

const ROW_HEIGHT = 24;
const OVERSCAN = 8;


function buildRows(
  rootPath: string,
  tree: ReturnType<typeof useFileTree>,
): { rows: Row[]; entryIndexByPath: Map<string, number> } {
  const rows: Row[] = [];
  const entryIndexByPath = new Map<string, number>();

  const walk = (parent: string, depth: number) => {
    const node = tree.nodes[parent];
    if (!node || node.status !== "loaded") return;
    for (const entry of node.entries) {
      const path = tree.joinPath(parent, entry.name);
      const isDir = entry.kind === "dir";
      const expanded = isDir && tree.expanded.has(path);
      const isRenaming = tree.renaming === path;
      if (isRenaming) {
        rows.push({
          kind: "rename",
          key: `rename:${path}`,
          path,
          name: entry.name,
          isDir,
          depth,
        });
      } else {
        entryIndexByPath.set(path, rows.length);
        rows.push({
          kind: "entry",
          key: path,
          path,
          name: entry.name,
          isDir,
          isExpanded: expanded,
          depth,
        });
      }
      if (isDir && expanded) {
        const child = tree.nodes[path];
        if (tree.pendingCreate?.parentPath === path) {
          rows.push({
            kind: "pending",
            key: `pending:${path}`,
            depth: depth + 1,
            pendingKind: tree.pendingCreate.kind,
          });
        }
        if (child?.status === "loading") {
          rows.push({
            kind: "status",
            key: `loading:${path}`,
            depth: depth + 1,
            tone: "muted",
            message: "Loading…",
          });
        } else if (child?.status === "error") {
          rows.push({
            kind: "status",
            key: `error:${path}`,
            depth: depth + 1,
            tone: "error",
            message: child.message,
          });
        } else if (child?.status === "loaded") {
          walk(path, depth + 1);
        }
      }
    }
  };

  walk(rootPath, 0);
  return { rows, entryIndexByPath };
}

export const FileExplorer = forwardRef<FileExplorerHandle, Props>(
  function FileExplorer(
    {
      rootPath,
      onOpenFile,
      onPathRenamed,
      onPathDeleted,
      onRevealInTerminal,
      onAttachToAgent,
      onOpenMarkdownPreview,
      onOpenNotebook,
      onOpenImage,
    },
    ref,
  ) {
    const { themeId, resolvedMode } = useTheme();
    const tree = useFileTree(rootPath, { onPathRenamed, onPathDeleted });
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const searchRef = useRef<ExplorerSearchHandle>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // ── Drag-to-move (mouse events) ──────────────────────────────────────
    // HTML5 drag-and-drop is swallowed by Tauri's webview drag handler (the
    // same reason the tab bar reorders with mouse events — see TabBar.tsx), so
    // moves are driven from raw mouse events. A row reports its mousedown; the
    // global listeners below own the threshold, hit-testing, hover-expand, and
    // the drop. `treeRef`/`rootPathRef` keep the listeners off stale state.
    const dragRef = useRef<{
      fromPath: string;
      startX: number;
      startY: number;
      dragging: boolean;
    } | null>(null);
    const targetDirRef = useRef<string | null>(null);
    const suppressClickRef = useRef(false);
    const hoverExpandRef = useRef<{
      path: string;
      timer: ReturnType<typeof setTimeout>;
    } | null>(null);
    const [dragSource, setDragSource] = useState<string | null>(null);
    const [dropTargetRow, setDropTargetRow] = useState<string | null>(null);

    // Mirrored after commit — read by drag/drop and hover-expand timers, which
    // fire between commits and so always see the last painted tree.
    const treeRef = useRef(tree);
    useEffect(() => {
      treeRef.current = tree;
    }, [tree]);
    const rootPathRef = useRef(rootPath);
    useEffect(() => {
      rootPathRef.current = rootPath;
    }, [rootPath]);

    const clearHoverExpand = useCallback(() => {
      if (hoverExpandRef.current) {
        clearTimeout(hoverExpandRef.current.timer);
        hoverExpandRef.current = null;
      }
    }, []);

    const drag = useMemo<ExplorerDrag>(
      () => ({
        onRowMouseDown: (e, path) => {
          if (e.button !== 0) return; // left button only
          dragRef.current = {
            fromPath: path,
            startX: e.clientX,
            startY: e.clientY,
            dragging: false,
          };
        },
        shouldSuppressClick: () => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return true;
          }
          return false;
        },
      }),
      [],
    );

    useEffect(() => {
      const THRESHOLD = 5;

      // What a cursor position drops onto: a row's folder (or a file's parent),
      // or the workspace root when over the header / empty space. Returns null
      // for an invalid target; also drives hover-to-expand on collapsed folders.
      const resolveTarget = (
        x: number,
        y: number,
        from: string,
      ): { rowKey: string; dir: string } | null => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        const rowEl = el.closest<HTMLElement>("[data-fs-path]");
        if (rowEl) {
          const rowPath = rowEl.dataset.fsPath ?? "";
          const isDir = rowEl.dataset.fsDir === "1";
          const dir = moveTargetDir(rowPath, isDir);
          if (!canMoveInto(from, dir)) {
            clearHoverExpand();
            return null;
          }
          if (isDir && !treeRef.current.expanded.has(rowPath)) {
            if (hoverExpandRef.current?.path !== rowPath) {
              clearHoverExpand();
              hoverExpandRef.current = {
                path: rowPath,
                timer: setTimeout(() => {
                  treeRef.current.expand(rowPath);
                  hoverExpandRef.current = null;
                }, 600),
              };
            }
          } else {
            clearHoverExpand();
          }
          return { rowKey: rowPath, dir };
        }
        clearHoverExpand();
        const zone = el.closest<HTMLElement>('[data-explorer-dropzone="root"]');
        const root = rootPathRef.current;
        if (zone && root && canMoveInto(from, root)) {
          return { rowKey: root, dir: root };
        }
        return null;
      };

      // Abandon the drag without moving anything. Used when the mouseup was
      // never delivered: released outside the window or a mid-drag focus
      // steal (no pointer capture on these mousemove/mouseup listeners, and
      // Wayland won't deliver the release to an unfocused surface). Without
      // this, dragRef stays armed and the document-wide grabbing cursor
      // sticks until some future mouseup inside the app.
      const cancelDrag = () => {
        dragRef.current = null;
        targetDirRef.current = null;
        clearHoverExpand();
        setDragSource(null);
        setDropTargetRow(null);
      };
      const onBlur = () => cancelDrag();

      const onMouseMove = (e: MouseEvent) => {
        const s = dragRef.current;
        if (!s) return;
        // First move back inside after a swallowed mouseup arrives with no
        // buttons held — the release happened where we couldn't see it, so
        // cancel rather than drop onto whatever is under the pointer now.
        if (e.buttons === 0) {
          cancelDrag();
          return;
        }
        if (!s.dragging) {
          if (
            Math.abs(e.clientX - s.startX) < THRESHOLD &&
            Math.abs(e.clientY - s.startY) < THRESHOLD
          )
            return;
          s.dragging = true;
          setDragSource(s.fromPath);
        }
        const target = resolveTarget(e.clientX, e.clientY, s.fromPath);
        targetDirRef.current = target?.dir ?? null;
        setDropTargetRow(target?.rowKey ?? null);
      };

      const onMouseUp = () => {
        const s = dragRef.current;
        const dir = targetDirRef.current;
        dragRef.current = null;
        targetDirRef.current = null;
        clearHoverExpand();
        if (s?.dragging) {
          // The mouseup is followed by a click on the source row; swallow it.
          suppressClickRef.current = true;
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
          if (dir) void treeRef.current.movePath(s.fromPath, dir);
        }
        setDragSource(null);
        setDropTargetRow(null);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("blur", onBlur);
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("blur", onBlur);
      };
    }, [clearHoverExpand]);

    // Grabbing cursor + suppressed text selection across the document while a
    // move-drag is in flight (mirrors the tab-drag affordance).
    useEffect(() => {
      if (dragSource === null) return;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = "url('/cursors/grabbing.png') 10 14, grabbing";
      document.body.style.userSelect = "none";
      return () => {
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
      };
    }, [dragSource]);

    // Manual refresh: re-list the whole visible tree and spin the icon briefly
    // so the action is visibly acknowledged even when nothing changed on disk
    // (the silent root-only background poll made the button feel inert).
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshSpinRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleRefresh = useCallback(() => {
      tree.refreshAll();
      setIsRefreshing(true);
      if (refreshSpinRef.current) clearTimeout(refreshSpinRef.current);
      refreshSpinRef.current = setTimeout(() => setIsRefreshing(false), 600);
    }, [tree]);
    useEffect(
      () => () => {
        if (refreshSpinRef.current) clearTimeout(refreshSpinRef.current);
      },
      [],
    );

    // The folder/file icon JSON loads async. If the tree first paints before
    // it's ready, icon URLs come back empty; re-render once it resolves so the
    // icons fill in immediately instead of waiting for the next interaction.
    const [, setIconsReady] = useState(false);
    useEffect(() => {
      let alive = true;
      void preloadIcons().then(() => {
        if (alive) setIconsReady(true);
      });
      return () => {
        alive = false;
      };
    }, []);

    const { rows, entryIndexByPath } = useMemo(() => {
      if (!rootPath) return { rows: [] as Row[], entryIndexByPath: new Map<string, number>() };
      return buildRows(rootPath, tree);
    }, [rootPath, tree.nodes, tree.expanded, tree.renaming, tree.pendingCreate, tree]);

    const entryPaths = useMemo<string[]>(() => {
      const out: string[] = [];
      for (const row of rows) if (row.kind === "entry") out.push(row.path);
      return out;
    }, [rows]);

    useEffect(() => {
      if (selectedPath && !entryIndexByPath.has(selectedPath)) {
        setSelectedPath(null);
      }
    }, [entryIndexByPath, selectedPath]);

    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: OVERSCAN,
      getItemKey: (index) => rows[index]?.key ?? index,
    });

    const scrollEntryIntoView = useCallback(
      (path: string) => {
        const index = entryIndexByPath.get(path);
        if (index === undefined) return;
        virtualizer.scrollToIndex(index, { align: "auto" });
      },
      [entryIndexByPath, virtualizer],
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          containerRef.current?.focus();
          if (!selectedPath && entryPaths.length > 0) {
            const first = entryPaths[0];
            setSelectedPath(first);
            requestAnimationFrame(() => scrollEntryIntoView(first));
          }
        },
        isFocused: () => {
          const c = containerRef.current;
          if (!c) return false;
          const active = document.activeElement;
          return active instanceof Node && c.contains(active);
        },
      }),
      [entryPaths, scrollEntryIntoView, selectedPath],
    );

    useGlobalShortcuts({
      "explorer.search": () => {
        if (searchRef.current?.isFocused()) {
          setIsSearchOpen(false);
          return;
        }
        setIsSearchOpen(true);
        searchRef.current?.focus();
      },
    });

    // Live sync. A native watcher is the primary mechanism; the 3 s poll
    // remains as a fallback because establishing a recursive watch genuinely
    // fails on large trees (Linux's inotify watch limit) — treating the
    // watcher as guaranteed would present as "the file tree silently stopped
    // updating" on exactly the biggest projects.
    const treeRefreshRef = useRef(tree.refresh);
    useEffect(() => {
      treeRefreshRef.current = tree.refresh;
    }, [tree.refresh]);
    // The returned cleanup tears down every allocation (interval, focus/blur/
    // visibilitychange listeners, the fs watch and its unlisten). The rule
    // can't follow the `listen` await inside the async IIFE; the `cancelled`
    // flag covers the unmount-before-resolve case.
    // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
    useEffect(() => {
      if (!rootPath) return;
      const INTERVAL_MS = 3000;
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let unlisten: (() => void) | null = null;
      let cancelled = false;

      const refresh = () => {
        // Same visibility gate the poll always had: a hidden window has no
        // tree to update, and refreshing it just burns work.
        if (document.visibilityState === "visible") {
          treeRefreshRef.current(rootPath);
        }
      };

      const startPolling = () => {
        if (intervalId !== null) return;
        intervalId = setInterval(refresh, INTERVAL_MS);
      };
      const stopPolling = () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };

      const onVisChange = () => {
        if (document.visibilityState === "visible") startPolling();
        else stopPolling();
      };

      const usePolling = () => {
        if (document.hasFocus()) startPolling();
        window.addEventListener("focus", startPolling);
        window.addEventListener("blur", stopPolling);
        document.addEventListener("visibilitychange", onVisChange);
      };

      void (async () => {
        try {
          const watching = await native.fsWatchStart(rootPath);
          if (cancelled) {
            // The root changed while we were starting; the watch we just
            // established is for a stale path.
            if (watching) void native.fsWatchStop().catch(() => {});
            return;
          }
          if (!watching) {
            usePolling();
            return;
          }
          unlisten = await listen("nexis://fs-changed", refresh);
          if (cancelled) {
            unlisten();
            unlisten = null;
          }
        } catch {
          // Backend unavailable or the command failed outright — the poll is
          // what keeps the explorer correct either way.
          if (!cancelled) usePolling();
        }
      })();

      return () => {
        cancelled = true;
        stopPolling();
        window.removeEventListener("focus", startPolling);
        window.removeEventListener("blur", stopPolling);
        document.removeEventListener("visibilitychange", onVisChange);
        unlisten?.();
        void native.fsWatchStop().catch(() => {});
      };
    }, [rootPath]);

    if (!rootPath) {
      const folderColor = getFolderColor(themeId, resolvedMode);
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <AnimatedFolder color={folderColor} size={1.6} />
          <div className="text-xs text-muted-foreground">
            No current directory
          </div>
        </div>
      );
    }

    const root = tree.nodes[rootPath];
    const pendingAtRoot =
      tree.pendingCreate?.parentPath === rootPath ? tree.pendingCreate : null;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (tree.renaming || tree.pendingCreate || isSearchOpen) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (entryPaths.length === 0) return;

      const currentIdx = selectedPath ? entryPaths.indexOf(selectedPath) : -1;
      const move = (next: number) => {
        const clamped = Math.max(0, Math.min(entryPaths.length - 1, next));
        const path = entryPaths[clamped];
        setSelectedPath(path);
        requestAnimationFrame(() => scrollEntryIntoView(path));
      };

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          move(currentIdx < 0 ? 0 : currentIdx + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          move(currentIdx < 0 ? entryPaths.length - 1 : currentIdx - 1);
          break;
        case "ArrowRight": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row.kind !== "entry") break;
          if (row.isDir) {
            if (!row.isExpanded) tree.toggle(row.path);
            else move(currentIdx + 1);
          }
          break;
        }
        case "ArrowLeft": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row.kind !== "entry") break;
          if (row.isDir && row.isExpanded) {
            tree.toggle(row.path);
          } else {
            const parent = row.path.slice(0, row.path.lastIndexOf("/"));
            if (parent && parent !== rootPath) setSelectedPath(parent);
          }
          break;
        }
        case "Enter": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row.kind !== "entry") break;
          if (row.isDir) tree.toggle(row.path);
          else onOpenFile(row.path);
          break;
        }
      }
    };

    const renderRow = (row: Row) => {
      switch (row.kind) {
        case "entry":
        case "rename": {
          return (
            <EntryRow
              path={row.path}
              name={row.name}
              isDir={row.isDir}
              isExpanded={row.kind === "entry" ? row.isExpanded : false}
              depth={row.depth}
              rootPath={rootPath}
              tree={tree}
              isSelected={selectedPath === row.path}
              isRenaming={row.kind === "rename"}
              isDragSource={dragSource === row.path}
              isDropTarget={dropTargetRow === row.path}
              drag={drag}
              onOpenFile={onOpenFile}
              onSelectPath={setSelectedPath}
              onRevealInTerminal={onRevealInTerminal}
              onAttachToAgent={onAttachToAgent}
              onOpenMarkdownPreview={onOpenMarkdownPreview}
              onOpenNotebook={onOpenNotebook}
              onOpenImage={onOpenImage}
            />
          );
        }
        case "pending":
          return (
            <PendingRow
              depth={row.depth}
              kind={row.pendingKind}
              onCommit={tree.commitCreate}
              onCancel={tree.cancelCreate}
            />
          );
        case "status":
          return (
            <StatusRow depth={row.depth} message={row.message} tone={row.tone} />
          );
      }
    };

    return (
      <div
        ref={containerRef}
        className="flex h-full flex-col outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div
          data-explorer-dropzone="root"
          className={cn(
            "flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-2 transition-colors",
            dropTargetRow === rootPath && "bg-primary/10",
          )}
        >
          <span
            className="flex flex-1 items-center truncate text-xs font-medium text-foreground/80"
            title={rootPath}
          >
            <img
              src={folderIconUrl(basename(rootPath), false)}
              alt=""
              height={15}
              width={15}
              className="mx-1.5"
            />
            {basename(rootPath)}
          </span>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]"
              onClick={() => setIsSearchOpen((v) => !v)}
              title="Search files"
              aria-label="Search files"
            >
              <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={2} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]"
              onClick={() => tree.beginCreate(rootPath, "file")}
              title="New file"
            >
              <HugeiconsIcon icon={FileAddIcon} size={13} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]"
              onClick={() => tree.beginCreate(rootPath, "dir")}
              title="New folder"
            >
              <HugeiconsIcon icon={FolderAddIcon} size={13} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]"
              onClick={handleRefresh}
              title="Refresh"
            >
              <HugeiconsIcon
                icon={Refresh01Icon}
                size={12}
                strokeWidth={2}
                className={cn(isRefreshing && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        <ExplorerSearch
          ref={searchRef}
          rootPath={rootPath}
          onOpenFile={onOpenFile}
          open={isSearchOpen}
          onRequestClose={() => setIsSearchOpen(false)}
          onActiveChange={setIsSearchActive}
          onRevealInTerminal={onRevealInTerminal}
          onAttachToAgent={onAttachToAgent}
        />

        {!isSearchActive ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                ref={scrollRef}
                data-explorer-dropzone="root"
                className={cn(
                  "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]",
                  dropTargetRow === rootPath &&
                    "ring-1 ring-inset ring-primary/60",
                )}
              >
                {pendingAtRoot ? (
                  <div
                    className="flex h-6 w-full min-w-0 items-center gap-2 px-1.5 text-[13px]"
                    style={{ paddingLeft: 6 }}
                  >
                    <span className="size-3.5 shrink-0" />
                    <img
                      src={
                        pendingAtRoot.kind === "dir"
                          ? folderIconUrl("", false)
                          : fileIconUrl("untitled")
                      }
                      alt=""
                      className="size-4 shrink-0 opacity-70"
                    />
                    <InlineInput
                      initial=""
                      placeholder={
                        pendingAtRoot.kind === "dir" ? "New folder" : "New file"
                      }
                      onCommit={tree.commitCreate}
                      onCancel={tree.cancelCreate}
                    />
                  </div>
                ) : null}
                {root?.status === "loading" && (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">
                    Loading…
                  </div>
                )}
                {root?.status === "error" && (
                  <div className="px-3 py-2 text-[11px] text-destructive">
                    {root.message}
                  </div>
                )}
                {root?.status === "loaded" ? (
                  <div
                    style={{
                      height: virtualizer.getTotalSize(),
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const row = rows[virtualRow.index];
                      if (!row) return null;
                      return (
                        <div
                          key={virtualRow.key}
                          data-virtual-row-index={virtualRow.index}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: virtualRow.size,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          {renderRow(row)}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent
              className={COMPACT_CONTENT}
              onCloseAutoFocus={(e) => {
                if (tree.renaming || tree.pendingCreate) e.preventDefault();
              }}
            >
              {onRevealInTerminal && (
                <ContextMenuItem
                  className={COMPACT_ITEM}
                  onSelect={() => onRevealInTerminal(rootPath)}
                >
                  Open in Terminal
                </ContextMenuItem>
              )}
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => void revealInFinder(rootPath)}
              >
                Reveal in Finder
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => tree.beginCreate(rootPath, "file")}
              >
                New File
              </ContextMenuItem>
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => tree.beginCreate(rootPath, "dir")}
              >
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => void copyToClipboard(rootPath)}
              >
                Copy Path
              </ContextMenuItem>
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={handleRefresh}
              >
                Refresh
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ) : null}
      </div>
    );
  },
);
