// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A thin line with a bright segment travelling along it: "a thought is in
 * progress, and it is still moving".
 *
 * This is a *live-stream-only* affordance and must stay one. Reasoning blocks
 * are pruned out of model history before compaction (CLAUDE.md pitfall #3),
 * so a stored assistant turn has no reasoning to be in progress — rendering
 * this from persisted state would animate something that is not happening.
 * Mount it while `isStreaming` is true and unmount it when that flips.
 *
 * Why a line rather than a spinner: a spinner says "busy", which the app
 * already says in three other places. A line with a moving head says "output
 * is arriving along this thread", which is the thing the user is actually
 * waiting on, and it reads at 11px next to text where a spinner does not.
 *
 * Motion comes from the caret cadence token, so it is the same pulse the
 * terminal cursor uses rather than a fourth independent rhythm.
 */

import { cn } from "@/lib/utils";

type Props = {
  /** Track length in CSS pixels. */
  width?: number;
  className?: string;
};

export function ThoughtLine({ width = 28, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block h-px shrink-0 overflow-hidden rounded-full bg-border",
        className,
      )}
      style={{ width }}
    >
      <span className="nexis-thought-head absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary" />
    </span>
  );
}
