// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A menu that draws its own structure: a trunk down the left of each group,
 * with a short elbow branching out to every row.
 *
 * Replaces grouping-by-whitespace. A heading plus a horizontal rule asks the
 * reader to infer that the rows below belong to the heading above; a drawn
 * branch states it. That matters most in the sidebar's overflow menu, which
 * is five groups deep and is the one place a user goes when they are already
 * unsure where something lives.
 *
 * Built from two dumb primitives rather than an `items={[...]}` prop so
 * callers keep full control of what a row is — the sidebar's rows carry a
 * badge and a pin toggle, and a data-driven API would need a slot for each.
 *
 * The lines are `aria-hidden` elements, not box-drawing characters. Drawn as
 * text they would land in the accessibility tree and in find-in-page, and
 * they would take the text colour rather than the border colour.
 */

import { cn } from "@/lib/utils";
import type * as React from "react";

/** Half a row, in px. The trunk stops here so it ends on the last elbow
 *  instead of overshooting to the bottom of the group box. */
const TRUNK_TAIL_PX = 11;

type GroupProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

export function BranchedGroup({ label, children, className }: GroupProps) {
  return (
    <div className={cn("relative", className)}>
      <p className="mb-1 px-1 text-[10px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
        {label}
      </p>
      <div className="relative flex flex-col gap-0.5">
        {/* The trunk. Absolutely positioned rather than a `border-l` so its
            end can be pulled up to the last row's centre. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-1 w-px bg-border/50"
          style={{ bottom: TRUNK_TAIL_PX }}
        />
        {children}
      </div>
    </div>
  );
}

type ItemProps = {
  children: React.ReactNode;
  className?: string;
};

export function BranchedItem({ children, className }: ItemProps) {
  return (
    <div className={cn("relative pl-3", className)}>
      {/* The elbow, vertically centred on the row. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1 h-px w-1.5 bg-border/50"
      />
      {children}
    </div>
  );
}
