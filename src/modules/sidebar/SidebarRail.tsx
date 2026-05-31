import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Clock01Icon,
  Database01Icon,
  FileCodeIcon,
  FolderGitTwoIcon,
  FolderTreeIcon,
  ListViewIcon,
  Router01Icon,
  RocketIcon,
  TaskAdd01Icon,
  TerminalIcon,
  TestTube01Icon,
  Time01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SidebarViewId } from "./types";

export const SIDEBAR_RAIL_HEIGHT = 40;

type RailItem = {
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
  const items: RailItem[] = [
    { id: "explorer", label: "Files", icon: FolderTreeIcon },
    { id: "recent-files", label: "Recent Files", icon: Clock01Icon },
    { id: "source-control", label: "Source Control", icon: FolderGitTwoIcon, badge: changedCount },
    { id: "processes", label: "Processes", icon: TaskAdd01Icon, badge: runningProcessCount },
    { id: "ports", label: "Ports", icon: Router01Icon },
    { id: "outline", label: "Outline", icon: ListViewIcon },
    { id: "snippets", label: "Snippets", icon: FileCodeIcon },
    { id: "tests", label: "Tests", icon: TestTube01Icon },
    { id: "database", label: "Database", icon: Database01Icon },
    { id: "build", label: "Build", icon: Wrench01Icon },
    { id: "ssh", label: "SSH", icon: TerminalIcon },
    { id: "release", label: "Release", icon: RocketIcon },
  ];

  return (
    <div
      style={{ height: SIDEBAR_RAIL_HEIGHT }}
      className="flex shrink-0 items-center border-t border-border/50 bg-card px-1.5"
    >
      {/* Scrollable icon strip — hides scrollbar, trackpad/wheel still works */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const isActive = item.id === activeView;
        const badge = item.badge && item.badge > 0 ? item.badge : null;

        return (
          <Tooltip key={item.id} delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={item.label}
                aria-pressed={isActive}
                onClick={() => onSelectView(item.id)}
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

                {/* Badge overlay */}
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

                {/* Active left-edge indicator */}
                {isActive ? (
                  <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-primary/70" />
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
      </div>{/* end scrollable strip */}

      {/* History button always visible at the right edge */}

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
            <TooltipContent side="top" className="text-xs">
              Commit history
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
}
