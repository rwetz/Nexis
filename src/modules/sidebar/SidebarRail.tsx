import { cn } from "@/lib/utils";
import {
  FileCodeIcon,
  FolderGitTwoIcon,
  FolderTreeIcon,
  ListViewIcon,
  TaskAdd01Icon,
  TestTube01Icon,
  Time01Icon,
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
    {
      id: "source-control",
      label: "Source Control",
      icon: FolderGitTwoIcon,
      badge: changedCount,
    },
    {
      id: "processes",
      label: "Processes",
      icon: TaskAdd01Icon,
      badge: runningProcessCount,
    },
    { id: "outline", label: "Outline", icon: ListViewIcon },
    { id: "snippets", label: "Snippets", icon: FileCodeIcon },
    { id: "tests", label: "Tests", icon: TestTube01Icon },
  ];

  return (
    <div
      style={{ height: SIDEBAR_RAIL_HEIGHT }}
      className="flex shrink-0 items-stretch gap-0.5 border-t border-border/50 bg-card/90 px-1.5 py-1.5 backdrop-blur"
    >
      {items.map((item) => {
        const isActive = item.id === activeView;
        const showBadge = !!item.badge && item.badge > 0;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={isActive}
            onClick={() => onSelectView(item.id)}
            className={cn(
              "group relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md text-[10.5px] font-medium outline-none transition-all duration-150",
              "focus-visible:ring-2 focus-visible:ring-primary/40",
              isActive
                ? "bg-primary/[0.07] text-foreground dark:bg-primary/[0.1]"
                : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
            )}
          >
            <HugeiconsIcon
              icon={item.icon}
              size={13}
              strokeWidth={isActive ? 2 : 1.75}
              className={cn(
                "shrink-0 transition-[stroke-width] duration-150",
                isActive && "text-primary",
              )}
            />
            <span className={cn(isActive && "font-semibold")}>{item.label}</span>
            {showBadge ? (
              <span
                className={cn(
                  "inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none tabular-nums",
                  isActive
                    ? "border border-primary/25 bg-primary/12 text-primary"
                    : "border border-border/60 bg-muted/60 text-muted-foreground/90",
                )}
              >
                {item.badge! > 99 ? "99+" : item.badge}
              </span>
            ) : null}
            {isActive ? (
              <span className="absolute inset-x-2.5 bottom-0 h-[1.5px] rounded-full bg-primary/55" />
            ) : null}
          </button>
        );
      })}

      {onOpenHistory ? (
        <>
          <div className="mx-0.5 my-1.5 w-px shrink-0 bg-border/40" aria-hidden />
          <button
            type="button"
            aria-label="Open commit history"
            title="Commit history"
            onClick={onOpenHistory}
            className={cn(
              "group flex w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150",
              "hover:bg-foreground/[0.05] hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <HugeiconsIcon icon={Time01Icon} size={13} strokeWidth={1.75} />
          </button>
        </>
      ) : null}
    </div>
  );
}
