// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A contribution heatmap for one repo: 53 weeks of daily commit counts, laid
 * out the way GitHub's is — weeks as columns, weekday as row.
 *
 * The data is local git history, not the GitHub API: Atlas scans directories
 * on disk, most of which have no remote at all, and a graph that only worked
 * for repos that happen to be on github.com would be blank for exactly the
 * private work this panel exists to show.
 *
 * It arrives with `atlas_repo_detail` rather than being fetched here. Atlas is
 * host-scoped and deliberately unauthorized -- its repos are arbitrary paths
 * found under `scan_root`, never entries in the workspace registry -- so the
 * workspace-scoped `git` CLI commands cannot serve it. That is also why this
 * component takes `days` as a prop: one drill-in, one round trip.
 *
 * Colour comes from `--terminal-ansi-green`, the same ramp the rest of the
 * app uses for "something happened here", stepped by opacity rather than by
 * five hardcoded greens — so it follows the active theme instead of pinning
 * GitHub's palette into a Nexis panel.
 */

import { cn } from "@/lib/utils";
import type { ActivityDay } from "@/modules/atlas/repos/types";
import { useEffect, useMemo, useRef } from "react";

/** Weeks drawn. GitHub shows 53; matching it keeps the shape familiar. */
const WEEKS = 53;
const DAYS_PER_WEEK = 7;

/** Opacity per intensity step. Index 0 is "no commits". */
const STEP_OPACITY = [0, 0.28, 0.5, 0.72, 1] as const;

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** `YYYY-MM-DD` in local time — the same key space the backend returns. */
function localKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type Cell = { key: string; date: Date; count: number; step: number };

/**
 * Build the grid, newest week last.
 *
 * The grid ends on the Saturday of the current week and runs back
 * `WEEKS * 7` days, so the last column is the week in progress and every
 * column is a full Sunday-to-Saturday week. Days in the future (the rest of
 * this week) are still emitted so the columns stay aligned; they simply have
 * a count of zero.
 */
export function buildGrid(
  days: ActivityDay[],
  today = new Date(),
): { cells: Cell[]; max: number; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const d of days) {
    counts.set(d.date, d.count);
    total += d.count;
  }

  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  // Advance to Saturday so the final column is a complete week.
  end.setDate(end.getDate() + (6 - end.getDay()));

  const start = new Date(end);
  start.setDate(start.getDate() - (WEEKS * DAYS_PER_WEEK - 1));

  const max = Math.max(1, ...counts.values());
  const cells: Cell[] = [];
  for (let i = 0; i < WEEKS * DAYS_PER_WEEK; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = localKey(date);
    const count = counts.get(key) ?? 0;
    // Four filled steps, scaled against the busiest day in the window. A
    // relative ramp rather than fixed thresholds: a repo with two commits a
    // week and one with forty both need to show contrast.
    const step =
      count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
    cells.push({ key, date, count, step });
  }

  return { cells, max, total };
}

type Props = {
  /**
   * Days with at least one commit, from `RepoDetail.activity`.
   *
   * `undefined` means the field was absent from the reply — a Rust binary
   * older than the command that added it. That is a different situation
   * from "this repo has no commits", and saying so beats drawing an empty
   * grid that looks like a bug.
   */
  days: ActivityDay[] | null | undefined;
  className?: string;
};

export function GitHubActivity({ days, className }: Props) {
  const grid = useMemo(() => buildGrid(days ?? []), [days]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start at the NEWEST week, not the oldest.
  //
  // 53 columns cannot fit a 380px panel, so the strip scrolls — and left-
  // aligned it opens on a year ago, which for any repo whose work is recent
  // is a screen of empty cells. It reads as "the graph is broken" rather
  // than "scroll right", and the count in the header saying 213 commits
  // while every visible cell is blank makes that worse, not better.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }, [grid.cells]);

  // Month labels sit above the first column whose week *starts* a new month,
  // which is how GitHub places them — labelling every column would not fit.
  const monthLabels = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let col = 0; col < WEEKS; col++) {
      const first = grid.cells[col * DAYS_PER_WEEK];
      if (!first) continue;
      const month = first.date.getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        out.push({ col, label: MONTH_NAMES[month] });
      }
    }
    return out;
  }, [grid.cells]);

  if (days === undefined) {
    return (
      <div className={cn("text-[11px] text-muted-foreground", className)}>
        Restart Nexis to load commit history — this view needs a newer build
        of the backend than the one currently running.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          Commit activity
        </span>
        <span className="text-[10.5px] tabular-nums text-muted-foreground">
          {days === null
            ? "Reading"
            : `${grid.total} commit${grid.total === 1 ? "" : "s"} this year`}
        </span>
      </div>

      {/* Horizontal scroll: 53 columns will not fit a 380px detail panel at
          any legible cell size, and shrinking the cells to fit is what makes
          these graphs unreadable. */}
      <div ref={scrollRef} className="overflow-x-auto overscroll-contain pb-1">
        <div className="inline-flex flex-col gap-1">
          <div
            className="grid gap-[3px] pl-[26px] text-[9px] text-muted-foreground"
            style={{
              gridTemplateColumns: `repeat(${WEEKS}, 10px)`,
            }}
          >
            {monthLabels.map(({ col, label }) => (
              <span
                key={`${col}-${label}`}
                className="col-span-3 whitespace-nowrap"
                style={{ gridColumnStart: col + 1 }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex gap-1">
            <div
              className="grid shrink-0 gap-[3px] text-[9px] leading-[10px] text-muted-foreground"
              style={{ gridTemplateRows: `repeat(${DAYS_PER_WEEK}, 10px)` }}
            >
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={i} className="w-[22px] text-right">
                  {label}
                </span>
              ))}
            </div>

            <div
              className="grid grid-flow-col gap-[3px]"
              style={{
                gridTemplateRows: `repeat(${DAYS_PER_WEEK}, 10px)`,
                gridTemplateColumns: `repeat(${WEEKS}, 10px)`,
              }}
            >
              {grid.cells.map((cell) => (
                <div
                  key={cell.key}
                  // `title` rather than a Tooltip: 371 cells would mean 371
                  // Radix instances for a hover hint on a decorative grid.
                  title={`${cell.count} commit${cell.count === 1 ? "" : "s"} on ${cell.key}`}
                  className={cn(
                    "size-[10px] rounded-[2px]",
                    cell.step === 0 && "bg-muted",
                  )}
                  style={
                    cell.step === 0
                      ? undefined
                      : {
                          backgroundColor: "var(--terminal-ansi-green)",
                          opacity: STEP_OPACITY[cell.step],
                        }
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground">
        <span>Less</span>
        {STEP_OPACITY.map((op, i) => (
          <div
            key={i}
            className={cn("size-[10px] rounded-[2px]", i === 0 && "bg-muted")}
            style={
              i === 0
                ? undefined
                : {
                    backgroundColor: "var(--terminal-ansi-green)",
                    opacity: op,
                  }
            }
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
