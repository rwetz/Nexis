// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Tab } from "./lib/tabTypes";
import { TabIcon, labelFor } from "./TabBar";

type Props = {
  tabs: Tab[];
  /** Tab ids in MRU order (most recent first). */
  order: number[];
  /** Highlighted index into `order`. */
  index: number;
  /** Mouse click on a row commits it immediately. */
  onPick: (id: number) => void;
};

/**
 * The hold-Ctrl+Tab overlay: tabs listed most-recently-used first, the
 * highlight advancing on each press, release-to-select. Pure presentation —
 * all keyboard state lives in useMruTabSwitcher.
 */
export function TabSwitcher({ tabs, order, index, onPick }: Props) {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted row visible when cycling through a long list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-mru-index="${index}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      <div
        ref={listRef}
        className="pointer-events-auto max-h-[50vh] w-80 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
      >
        {order.map((id, i) => {
          const t = byId.get(id);
          if (!t) return null;
          return (
            <button
              key={id}
              type="button"
              data-mru-index={i}
              onClick={() => onPick(id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                i === index
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TabIcon tab={t} />
              <span className="truncate">{labelFor(t)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
