// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtShortcut, MOD_KEY } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { FileTypeIcon } from "@/modules/explorer/lib/FileTypeIcon";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useEffect, useRef, useState } from "react";
import type { Tab } from "./lib/tabTypes";
import { editorAnyDirty } from "./lib/tabTypes";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onNewWindow?: () => void;
  onClose: (id: number) => void;
  /** Pin (promote) a preview tab to persistent on double-click. */
  onPin: (id: number) => void;
  /** Commit a fully reordered tab list (called on mouseup after live drag). */
  onReorder?: (newOrder: number[]) => void;
  compact?: boolean;
};

export function TabBar({
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onNewWindow,
  onClose,
  onPin,
  onReorder,
  compact,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag-to-reorder — mouse events only (HTML5 drag API conflicts with Tauri's
  // data-tauri-drag-region on the parent container and silently drops events).
  //
  // During a drag we maintain a local `dragOrder` (a reordered copy of `tabs`)
  // that updates live as the cursor moves — Chrome-style.  On mouseup we commit
  // the final order by calling onReorder.  All mutable tracking lives in refs
  // so the global listeners never form stale closures over React state.

  // Keep a stable ref to the latest `tabs` prop for use inside the effect.
  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const dragState = useRef<{
    fromId: number;
    startX: number;
    dragging: boolean;
  } | null>(null);

  // dragOrderRef mirrors dragOrder state so handlers can read the latest value.
  const [dragOrder, setDragOrder] = useState<Tab[] | null>(null);
  const dragOrderRef = useRef<Tab[] | null>(null);
  useEffect(() => { dragOrderRef.current = dragOrder; }, [dragOrder]);

  const [draggingId, setDraggingId] = useState<number | null>(null);

  useEffect(() => {
    if (!onReorder) return;

    const onMouseMove = (e: MouseEvent) => {
      const s = dragState.current;
      if (!s) return;

      // The mouseup for this drag was swallowed (released outside the window
      // — these listeners take no pointer capture, and Wayland won't deliver
      // the release to an unfocused surface). The first move back inside
      // arrives with no buttons held: finish the drag as a normal drop so
      // the state and the document-wide grabbing cursor don't stay stuck.
      if (e.buttons === 0) {
        onMouseUp();
        return;
      }

      // Cross threshold → enter drag mode, snapshot current order
      if (!s.dragging) {
        if (Math.abs(e.clientX - s.startX) < 5) return;
        s.dragging = true;
        setDraggingId(s.fromId);
        const initial = [...tabsRef.current];
        dragOrderRef.current = initial;
        setDragOrder(initial);
        return;
      }

      const order = dragOrderRef.current;
      if (!order) return;

      const draggedTab = order.find((t) => t.id === s.fromId);
      if (!draggedTab) return;

      // Query tab triggers in their current DOM (= dragOrder) positions
      const triggerEls = Array.from(
        scrollRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [],
      );

      // Compute where to insert: find the first non-dragged tab whose midpoint
      // is past the cursor — insert before it.  Default: append at the end.
      const withoutDragged = order.filter((t) => t.id !== s.fromId);
      // Built once before the scan: this runs on every pointer move during a
      // drag, so the position lookup should not rescan the tab list.
      const indexById = new Map(withoutDragged.map((t, i) => [t.id, i]));
      let insertIdx = withoutDragged.length;

      for (const el of triggerEls) {
        const tabId = Number(el.dataset.tabId);
        if (tabId === s.fromId) continue; // skip the tab being dragged
        const { left, width } = el.getBoundingClientRect();
        if (e.clientX < left + width / 2) {
          insertIdx = indexById.get(tabId) ?? withoutDragged.length;
          break;
        }
      }

      const newOrder = [...withoutDragged];
      newOrder.splice(insertIdx, 0, draggedTab);

      // Skip setState if order didn't change (avoids thrashing on every pixel)
      const changed = newOrder.some((t, i) => t.id !== order[i]?.id);
      if (changed) {
        dragOrderRef.current = newOrder;
        setDragOrder(newOrder);
      }
    };

    const onMouseUp = () => {
      const s = dragState.current;
      const finalOrder = dragOrderRef.current;
      if (s?.dragging && finalOrder) {
        onReorder(finalOrder.map((t) => t.id));
      }
      dragState.current = null;
      dragOrderRef.current = null;
      setDraggingId(null);
      setDragOrder(null);
    };

    // Focus stolen mid-drag (Alt-Tab, native window drag): abandon without
    // committing a reorder the user never completed.
    const onBlur = () => {
      dragState.current = null;
      dragOrderRef.current = null;
      setDraggingId(null);
      setDragOrder(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [onReorder]);

  // Apply grabbing cursor to the whole document while a tab drag is in flight,
  // so the cursor stays correct even when the pointer leaves the source tab.
  useEffect(() => {
    if (draggingId === null) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "url('/cursors/grabbing.png') 10 14, grabbing";
    return () => { document.body.style.cursor = prev; };
  }, [draggingId]);

  // Horizontal wheel scroll without holding shift.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active tab visible after selection / open.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  return (
    <div
      ref={scrollRef}
      data-tauri-drag-region
      className="min-w-0 shrink overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="relative flex w-max items-center gap-0.5">
        <Tabs
          value={String(activeId)}
          onValueChange={(v) => onSelect(Number(v))}
        >
          <TabsList className="h-7 w-max gap-0.5 bg-transparent p-0">
            {(dragOrder ?? tabs).map((t) => {
              const isPreview =
                t.kind === "editor" &&
                t.paneTree.kind === "leaf" &&
                t.paneTree.preview === true;
              return (
                <TabsTrigger
                  key={t.id}
                  value={String(t.id)}
                  data-tab-id={t.id}
                  onDoubleClick={() => isPreview && onPin(t.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1) { e.preventDefault(); onClose(t.id); }
                  }}
                  onMouseDown={(e) => {
                    if (!onReorder || e.button !== 0) return;
                    // stopPropagation prevents Tauri's data-tauri-drag-region
                    // on the parent div from treating this as a window drag.
                    e.stopPropagation();
                    dragState.current = {
                      fromId: t.id,
                      startX: e.clientX,
                      dragging: false,
                    };
                  }}
                  className={cn(
                    // Active state reads by fill + text contrast alone; the
                    // base TabsTrigger focus ring is suppressed because Radix
                    // tabs activate on focus, so the active style *is* the
                    // keyboard focus indicator.
                    "group relative h-7 shrink-0 gap-1.5 rounded-md text-xs text-muted-foreground transition-colors data-[state=active]:bg-accent data-[state=active]:text-foreground hover:text-foreground/80 justify-between",
                    "focus-visible:ring-0 focus-visible:outline-none",
                    compact ? "px-1.5!" : "ps-2! pe-1!",
                    onReorder && "cursor-grab",
                    draggingId === t.id && "opacity-50 ring-1 ring-primary/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-1.5 truncate",
                      compact ? "max-w-48" : "max-w-80",
                    )}
                  >
                    <TabIcon tab={t} />
                    {/* Preview tabs use italic to signal the transient state,
                        matching the visual convention from VSCode. */}
                    <span className={cn("truncate", isPreview && "italic")}>
                      {labelFor(t)}
                    </span>
                    {t.kind === "editor" && editorAnyDirty(t) ? (
                      <span
                        aria-label="Unsaved changes"
                        className="size-1.5 shrink-0 rounded-full bg-foreground/70"
                      />
                    ) : null}
                  </span>
                  {/* A <span role="button"> rather than a real <button>: the
                      enclosing TabsTrigger is itself a <button>, and nesting
                      one inside another is invalid HTML that browsers recover
                      from unpredictably. */}
                  <span
                    // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
                    role="button"
                    tabIndex={0}
                    aria-label="Close tab"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose(t.id);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(t.id);
                    }}
                    className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
                  >
                    <Icon name="close" size="xs" />
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New tab"
              // Anchors the onboarding tour (src/lib/onboarding.ts).
              data-tour="tab-new"
            >
              <Icon name="add" size="md" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem onSelect={() => onNew()}>
              <Icon name="terminal" size="md" />
              <span className="flex-1">Terminal</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "T")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewPrivate()}>
              <Icon name="incognito" size="md" />
              <span className="flex-1">Privacy</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "R")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewEditor()}>
              <Icon name="edit" size="md" />
              <span className="flex-1">Editor</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "E")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewPreview()}>
              <Icon name="globe" size="md" />
              <span className="flex-1">Preview</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "P")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewGitGraph()}>
              <Icon name="git-branch" size="md" />
              <span className="flex-1">Git Graph</span>
            </DropdownMenuItem>
            {onNewWindow && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onNewWindow}>
                  <Icon name="add-box" size="md" />
                  <span className="flex-1">New Window</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtShortcut(MOD_KEY, "⇧N")}
                  </span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function TabIcon({ tab }: { tab: Tab }) {
  if (tab.kind === "editor" || tab.kind === "markdown") {
    return <FileTypeIcon name={tab.title} className="size-3.5 shrink-0" />;
  }
  if (tab.kind === "image") {
    return (
      <Icon name="image" size="md" className="shrink-0 text-muted-foreground/70" />
    );
  }
  if (tab.kind === "preview") {
    return (
      <Icon name="globe" size="md" className="shrink-0" />
    );
  }
  if (tab.kind === "ai-diff") {
    return (
      <Icon name="git-compare" size="md" className="shrink-0" />
    );
  }
  if (tab.kind === "terminal" && tab.private) {
    return (
      <Icon name="incognito" size="md" className="shrink-0" />
    );
  }
  if (tab.kind === "git-diff" || tab.kind === "git-commit-file") {
    return (
      <Icon name="git-compare" size="md" className="shrink-0" />
    );
  }
  if (tab.kind === "git-history") {
    return (
      <Icon name="clock" size="md" className="shrink-0" />
    );
  }
  if (tab.kind === "ml-network") {
    return (
      <Icon name="network" size="md" className="shrink-0" />
    );
  }
  if (tab.kind === "svg-playground") {
    return (
      <Icon name="brush" size="md" className="shrink-0" />
    );
  }
  return (
    <Icon name="terminal" size="md" className="shrink-0" />
  );
}

export function labelFor(t: Tab): string {
  if (t.kind === "editor") return t.title;
  if (t.kind === "preview") return t.title;
  if (t.kind === "markdown") return t.title;
  if (t.kind === "notebook") return t.title;
  if (t.kind === "image") return t.title;
  if (t.kind === "ai-diff") return t.title;
  if (t.kind === "git-diff") return t.title;
  if (t.kind === "git-history") return t.title;
  if (t.kind === "git-commit-file") return t.title;
  if (t.kind === "ml-network") return t.title;
  if (t.kind === "svg-playground") return t.title;
  // t is TerminalTab from here — prefer OSC 0/2 title when set by the shell.
  if (t.oscTitle) return t.oscTitle;
  if (!t.cwd) return t.title;
  const parts = t.cwd.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "/";
}
