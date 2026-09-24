// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The mark that travels along a `useGlidingRail` nav: an underline, a side
 * bar, or a pill behind the selected item.
 *
 * **It moves by clipping, never by resizing.** Every rail used to animate the
 * mark's `width` (or `height`) alongside `x`, and a size is a layout property:
 * the browser re-ran layout on every frame of every glide. Here the element
 * is laid out once, spanning the whole rail, and a `clip-path: inset(...)`
 * cuts it down to the item. Clip-path animates as paint alone, and — unlike
 * a `scaleX` — its `round` radius keeps the pill's corners true at any width
 * instead of stretching them.
 *
 * The span is the items' far edge, not the visible box, so a rail that
 * scrolls (the bottom panel's tab strip) can still reach a tab scrolled out
 * of view. The hook explains why that is not `scrollWidth`.
 */

import { cn } from "@/lib/utils";
import { m } from "motion/react";
import type { GlidingRail, RailRect } from "./use-gliding-rail";

export function RailIndicator({
  rail,
  rect,
  radius = 0,
  className,
}: {
  rail: Pick<GlidingRail<unknown>, "axis" | "containerExtent" | "transition">;
  /** Usually `rail.activeRect` or `rail.hoverRect`. Nothing renders when null. */
  rect: RailRect | null;
  /** Corner radius of the visible mark, in px. */
  radius?: number;
  /** Placement across the axis (e.g. `bottom-0 h-[2px]`) and colour. */
  className?: string;
}) {
  if (!rect || rail.containerExtent <= 0) return null;
  const start = Math.max(0, rect.offset);
  const end = Math.max(0, rail.containerExtent - rect.offset - rect.extent);
  const horizontal = rail.axis === "horizontal";
  const clipPath = horizontal
    ? `inset(0px ${end}px 0px ${start}px round ${radius}px)`
    : `inset(${start}px 0px ${end}px 0px round ${radius}px)`;
  return (
    <m.span
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      style={
        horizontal
          ? { left: 0, width: rail.containerExtent }
          : { top: 0, height: rail.containerExtent }
      }
      initial={false}
      animate={{ clipPath }}
      transition={rail.transition}
    />
  );
}
