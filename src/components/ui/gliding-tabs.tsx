// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A small tab strip whose selection travels.
 *
 * `useGlidingRail` is the rule for every nav in the app (see the icon-and-
 * motion vault note), but each strip that used it wired the same forty lines
 * by hand: measure, register, a `motion.span` pill, the hover reset. Sub-tabs
 * inside panels mostly didn't bother and painted their own background per
 * button, so the selection blinked from place to place while the strip above
 * it glided. This is the hook as a component, sized for those inner strips:
 * one pill that moves, the same spring, one line at the call site.
 */

import { RailIndicator } from "@/components/ui/rail-indicator";
import { Icon, type IconName } from "@/components/icon";
import { useGlidingRail } from "@/components/ui/use-gliding-rail";
import { cn } from "@/lib/utils";

export type GlidingTab<Id extends string> = {
  id: Id;
  label: string;
  icon?: IconName;
};

export function GlidingTabs<Id extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly GlidingTab<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  /** Accessible name for the tablist. */
  label: string;
  className?: string;
}) {
  const rail = useGlidingRail<Id>(value, "horizontal", tabs.length);
  return (
    <div
      ref={rail.containerRef}
      role="tablist"
      aria-label={label}
      className={cn("relative flex items-center gap-1", className)}
      onPointerLeave={() => rail.setHoverId(null)}
    >
      <RailIndicator
        rail={rail}
        rect={rail.activeRect}
        radius={8}
        className="inset-y-0 bg-primary/15"
      />
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            ref={(el) => rail.registerItem(t.id, el)}
            onClick={() => onChange(t.id)}
            onPointerEnter={() => rail.setHoverId(t.id)}
            className={cn(
              "relative z-10 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              selected ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon && <Icon name={t.icon} size="xs" active={selected} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
