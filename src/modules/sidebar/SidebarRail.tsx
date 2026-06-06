// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bug01Icon,
  Clock01Icon,
  Database01Icon,
  FileCodeIcon,
  FolderGitTwoIcon,
  FolderTreeIcon,
  LayersIcon,
  ListViewIcon,
  MoreHorizontalIcon,
  PinIcon,
  Router01Icon,
  RocketIcon,
  TaskAdd01Icon,
  TerminalIcon,
  ComputerTerminal01Icon,
  TestTube01Icon,
  Time01Icon,
  Wrench01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import {
  BookmarkAdd01Icon,
  CodeSquareIcon,
  FlashIcon,
  Globe02Icon,
  MagicWand01Icon,
  Note01Icon,
  Queue01Icon,
  SearchCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SidebarViewId } from "./types";

export const SIDEBAR_RAIL_HEIGHT = 40;

const STORAGE_KEY = "nexis:pinned-rail-items";

const DEFAULT_PINNED: SidebarViewId[] = [
  "explorer",
  "recent-files",
  "source-control",
  "processes",
  "outline",
  "debugger",
  "tests",
  "build",
];

function loadPinned(): SidebarViewId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SidebarViewId[];
  } catch {}
  return DEFAULT_PINNED;
}

function savePinned(ids: SidebarViewId[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

type RailItemDef = {
  id: SidebarViewId;
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  badge?: number;
};

type Props = {
  activeView: SidebarViewId;
  onSelectView: (view: SidebarViewId) => void;
  changedCount: number;
  runningProcessCount?: number;
  onOpenHistory?: () => void;
};

export function SidebarRail({
  activeView,
  onSelectView,
  changedCount,
  runningProcessCount,
  onOpenHistory,
}: Props) {
  const [pinned, setPinned] = useState<SidebarViewId[]>(loadPinned);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const allItems: RailItemDef[] = [
    { id: "explorer", label: "Files", icon: FolderTreeIcon },
    { id: "recent-files", label: "Recent Files", icon: Clock01Icon },
    { id: "source-control", label: "Source Control", icon: FolderGitTwoIcon, badge: changedCount },
    { id: "processes", label: "Processes", icon: TaskAdd01Icon, badge: runningProcessCount },
    { id: "ports", label: "Ports", icon: Router01Icon },
    { id: "profiles", label: "Profiles", icon: LayersIcon },
    { id: "repl", label: "REPL", icon: ComputerTerminal01Icon },
    { id: "outline", label: "Outline", icon: ListViewIcon },
    { id: "snippets", label: "Snippets", icon: FileCodeIcon },
    { id: "debugger", label: "Debugger", icon: Bug01Icon },
    { id: "tests", label: "Tests", icon: TestTube01Icon },
    { id: "database", label: "Database", icon: Database01Icon },
    { id: "build", label: "Build", icon: Wrench01Icon },
    { id: "code-review", label: "Code Review", icon: CodeSquareIcon },
    { id: "agent-queue", label: "Agent Queue", icon: Queue01Icon },
    { id: "symbol-search", label: "Symbol Search", icon: SearchCodeIcon },
    { id: "refactor", label: "AI Refactor", icon: MagicWand01Icon },
    { id: "share", label: "Share", icon: Globe02Icon },
    { id: "prompt-templates", label: "Prompt Templates", icon: FlashIcon },
    { id: "bookmarks", label: "Bookmarks", icon: BookmarkAdd01Icon },
    { id: "notes", label: "Workspace Notes", icon: Note01Icon },
    { id: "shell-snippets", label: "Shell Snippets", icon: ComputerTerminal01Icon },
    { id: "ssh", label: "SSH", icon: TerminalIcon },
    { id: "release", label: "Release", icon: RocketIcon },
  ];

  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  const pinnedItems = pinned
    .map((id) => itemMap.get(id))
    .filter((x): x is RailItemDef => x != null);

  const overflowItems = allItems.filter((i) => !pinned.includes(i.id));

  const pin = useCallback((id: SidebarViewId) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      savePinned(next);
      return next;
    });
  }, []);

  const unpin = useCallback((id: SidebarViewId) => {
    setPinned((prev) => {
      const next = prev.filter((x) => x !== id);
      savePinned(next);
      return next;
    });
  }, []);

  return (
    <div
      style={{ height: SIDEBAR_RAIL_HEIGHT }}
      className="flex shrink-0 items-center border-t border-border/50 bg-card px-1.5"
    >
      {/* Pinned icon strip */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pinnedItems.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            isActive={item.id === activeView}
            onClick={() => onSelectView(item.id)}
          />
        ))}
      </div>

      {/* Overflow ··· button — outside scrollable strip so it's always visible */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="More panels"
                  className={cn(
                    "relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-all duration-150",
                    "focus-visible:ring-2 focus-visible:ring-primary/40",
                    popoverOpen
                      ? "bg-primary/[0.07] text-foreground dark:bg-primary/[0.1]"
                      : "text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]",
                  )}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={14} strokeWidth={1.75} />
                  {/* Dot indicator if active view is in overflow */}
                  {overflowItems.some((i) => i.id === activeView) && (
                    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">More panels</TooltipContent>
          </Tooltip>

          <PopoverContent
            side="top"
            align="start"
            sideOffset={6}
            className="w-56 gap-0 p-2"
          >
            {/* Pinned section */}
            {pinnedItems.length > 0 && (
              <>
                <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Pinned
                </p>
                <div className="mb-2 flex flex-col gap-0.5">
                  {pinnedItems.map((item) => (
                    <OverflowRow
                      key={item.id}
                      item={item}
                      isActive={item.id === activeView}
                      isPinned
                      onSelect={() => { onSelectView(item.id); setPopoverOpen(false); }}
                      onTogglePin={() => unpin(item.id)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Overflow section */}
            {overflowItems.length > 0 && (
              <>
                {pinnedItems.length > 0 && (
                  <div className="my-1 h-px bg-border/40" />
                )}
                <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  More
                </p>
                <div className="flex flex-col gap-0.5">
                  {overflowItems.map((item) => (
                    <OverflowRow
                      key={item.id}
                      item={item}
                      isActive={item.id === activeView}
                      isPinned={false}
                      onSelect={() => { onSelectView(item.id); setPopoverOpen(false); }}
                      onTogglePin={() => pin(item.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>

      {/* History button */}
      {onOpenHistory ? (
        <>
          <div className="mx-0.5 h-4 w-px shrink-0 bg-border/40" aria-hidden />
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Open commit history"
                onClick={onOpenHistory}
                className={cn(
                  "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md",
                  "text-muted-foreground outline-none transition-colors duration-150",
                  "hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]",
                  "focus-visible:ring-2 focus-visible:ring-primary/40",
                )}
              >
                <HugeiconsIcon icon={Time01Icon} size={14} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Commit history</TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
}

// ── Rail icon button ──────────────────────────────────────────────────────────

function RailButton({
  item,
  isActive,
  onClick,
}: {
  item: RailItemDef;
  isActive: boolean;
  onClick: () => void;
}) {
  const badge = item.badge && item.badge > 0 ? item.badge : null;
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={item.label}
          aria-pressed={isActive}
          onClick={onClick}
          className={cn(
            "relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-all duration-150",
            "focus-visible:ring-2 focus-visible:ring-primary/40",
            isActive
              ? "bg-primary/[0.07] text-foreground dark:bg-primary/[0.1]"
              : "text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]",
          )}
        >
          <HugeiconsIcon
            icon={item.icon}
            size={14}
            strokeWidth={isActive ? 2 : 1.75}
            className={cn(
              "shrink-0 transition-[stroke-width,color] duration-150",
              isActive && "text-primary",
            )}
          />
          {badge ? (
            <span className={cn(
              "absolute -right-0.5 -top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full px-0.5",
              "text-[8px] font-bold leading-none tabular-nums",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted-foreground/70 text-background",
            )}>
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
          {isActive ? (
            <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-primary/70" />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{item.label}</TooltipContent>
    </Tooltip>
  );
}

// ── Overflow popover row ──────────────────────────────────────────────────────

function OverflowRow({
  item,
  isActive,
  isPinned,
  onSelect,
  onTogglePin,
}: {
  item: RailItemDef;
  isActive: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const badge = item.badge && item.badge > 0 ? item.badge : null;
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors",
        isActive ? "bg-primary/[0.07]" : "hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <HugeiconsIcon
          icon={item.icon}
          size={13}
          strokeWidth={isActive ? 2 : 1.75}
          className={cn(
            "shrink-0",
            isActive ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className={cn(
          "truncate text-[11px] font-medium",
          isActive ? "text-foreground" : "text-foreground/80",
        )}>
          {item.label}
        </span>
        {badge ? (
          <span className="ml-auto shrink-0 rounded-full bg-muted-foreground/60 px-1 text-[9px] font-bold text-background">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </button>

      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
              isPinned
                ? "text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100"
                : "text-muted-foreground/40 hover:text-primary opacity-0 group-hover:opacity-100",
            )}
          >
            <HugeiconsIcon
              icon={isPinned ? Cancel01Icon : PinIcon}
              size={11}
              strokeWidth={1.75}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {isPinned ? "Unpin" : "Pin to rail"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
