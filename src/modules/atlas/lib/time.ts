// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Time formatting for commit timestamps.
 *
 * These are not a sixth private copy of `relativeTime` (pitfall #12). Two
 * things genuinely differ from the canonical helper in `@/lib/format`, and
 * neither is a matter of taste:
 *
 * - **Git hands out epoch *seconds*.** The canonical helper takes
 *   milliseconds, like every other timestamp in Nexis.
 * - **Commit ages run long.** The canonical helper stops at days, which is
 *   right for its callers (a recently-opened file, a running process, a
 *   working-tree change) and useless here — a repo you last touched in March
 *   reading as "183d ago" is a number you have to do arithmetic on.
 *
 * So the long tail is added here and *everything shorter than a week delegates*
 * rather than being reimplemented. That keeps one implementation of "just now"
 * through "6d ago" — which is the part that was drifting across five copies —
 * and confines this file to the buckets the canonical one does not have.
 */

import { relativeTime as relativeTimeMs } from "@/lib/format";

const DAY_S = 86_400;

/** Compact relative time for a commit timestamp in epoch **seconds**. */
export function relativeTime(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds)) return "—";
  const diffS = Math.max(0, Date.now() / 1000 - unixSeconds);
  const days = Math.floor(diffS / DAY_S);

  // Under a week is exactly what the canonical helper already says.
  if (days < 7) return relativeTimeMs(unixSeconds * 1000);

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** The full timestamp, for the detail pane where the exact date is the point. */
export function absoluteTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
