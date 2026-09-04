// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Aggregates over the command ledger — the arithmetic behind two of ROADMAP's
 * ledger-gated features.
 *
 * **Build-time trends.** Every block is already timed, so charting the median
 * of a given command per repo over weeks costs nothing extra. The regression
 * it catches — *`cargo build` went 18s to 47s three commits ago* — is normally
 * invisible until it is unbearable, because nothing else times the commands
 * you actually run.
 *
 * **Work journal.** *"Today: 3 commits, 47 builds, 2h in `src/modules/ai`."*
 * Worth naming why this is missing everywhere else: developer tools are built
 * for teams, and a team gets this from the tracker. A solo developer has no
 * tracker, and nothing reconstructs the day.
 *
 * All pure functions over records the caller already read. They live apart
 * from the panel so they can be tested without a webview, and so a future
 * surface (the AI's context, a status-bar pill) can reuse them rather than
 * re-deriving the same medians slightly differently.
 */

import type { CommandRecord } from "@/modules/terminal/lib/ledger";

/**
 * Commands whose *first* word says almost nothing on its own — a journal that
 * reports "47 runs of pnpm" has told you nothing you did not know. For these,
 * the family is the first two words, so `pnpm build` and `pnpm test` count
 * separately. Everything else groups on the first word alone.
 */
const SUBCOMMAND_DRIVERS = new Set([
  "cargo",
  "docker",
  "dotnet",
  "gh",
  "git",
  "go",
  "npm",
  "npx",
  "pnpm",
  "poetry",
  "uv",
  "yarn",
]);

/** Leading words that describe *how* a command ran, not *what* ran. */
const PREFIXES = new Set(["sudo", "time", "env", "nohup", "doas"]);

/**
 * The coarse identity of a command, for grouping.
 *
 * `cargo build --release -p nexis` and `cargo build` are the same activity and
 * belong in the same bucket; `cargo test` is a different one. Flags are
 * dropped because they are where the noise lives — a journal split across
 * fourteen variants of the same build is a journal nobody reads.
 */
export function commandFamily(argv: string): string {
  const words = argv.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  // Skip modifiers and inline `VAR=value` assignments, which are prologue.
  while (i < words.length && (PREFIXES.has(words[i]) || /^[\w.]+=/.test(words[i]))) i++;
  const head = words[i];
  if (!head) return argv.trim();
  if (!SUBCOMMAND_DRIVERS.has(head)) return head;
  // The next word only counts as a subcommand if it is one — `git -C ../x
  // status` must not be filed under "git -C".
  const next = words[i + 1];
  return next && !next.startsWith("-") ? `${head} ${next}` : head;
}

/** Exact command line, whitespace-normalized, for the trend table. */
export function normalizeArgv(argv: string): string {
  return argv.trim().replace(/\s+/g, " ");
}

/** Median of a non-empty list. Returns 0 for an empty one. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export type Trend = {
  /** The normalized command line this row is about. */
  argv: string;
  runs: number;
  failures: number;
  /** Median duration across every run, in ms. */
  medianMs: number;
  /** The most recent run's duration and when it happened. */
  lastMs: number;
  lastAt: number;
  /** Total time this command has cost, in ms — the sort key. */
  totalMs: number;
  /**
   * Percentage change between the median of the newest half of the runs and
   * the median of the older half. Null when there are too few runs for the
   * comparison to mean anything — an honest gap rather than a number derived
   * from two samples.
   */
  driftPct: number | null;
  /** Durations oldest-to-newest, for a sparkline. */
  series: number[];
};

/** Below this, a duration is measurement noise rather than a build time. */
const MIN_INTERESTING_MS = 700;

/** Fewer runs than this and a drift figure would be two samples pretending. */
const MIN_RUNS_FOR_DRIFT = 6;

export type TrendOptions = {
  /** Drop commands with fewer runs than this. */
  minRuns?: number;
  /** Drop commands whose median is below this, in ms. */
  minMedianMs?: number;
  /** How many rows to return. */
  limit?: number;
};

/**
 * Group records by exact command line and summarize each group.
 *
 * Records may arrive in any order; they are sorted by start time inside each
 * group so "the last run" and the sparkline mean what they say.
 */
export function buildTrends(
  records: CommandRecord[],
  options: TrendOptions = {},
): Trend[] {
  const {
    minRuns = 2,
    minMedianMs = MIN_INTERESTING_MS,
    limit = 40,
  } = options;

  const groups = new Map<string, CommandRecord[]>();
  for (const r of records) {
    const key = normalizeArgv(r.argv);
    if (key === "") continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const trends: Trend[] = [];
  for (const [argv, group] of groups) {
    if (group.length < minRuns) continue;
    const ordered = [...group].sort((a, b) => a.startedAt - b.startedAt);
    const series = ordered.map((r) => r.durationMs);
    const medianMs = median(series);
    if (medianMs < minMedianMs) continue;

    const last = ordered[ordered.length - 1];
    trends.push({
      argv,
      runs: ordered.length,
      failures: ordered.filter((r) => r.exitCode !== 0).length,
      medianMs,
      lastMs: last.durationMs,
      lastAt: last.startedAt,
      totalMs: series.reduce((a, b) => a + b, 0),
      driftPct: drift(series),
      series,
    });
  }

  // Sorted by total time spent: "where the wall-clock actually goes" is the
  // question a trends table exists to answer, and a command run 200 times for
  // 2s each costs more of your day than one 40s outlier.
  return trends.sort((a, b) => b.totalMs - a.totalMs).slice(0, limit);
}

/** Newest-half median against older-half median, as a percentage change. */
function drift(series: number[]): number | null {
  if (series.length < MIN_RUNS_FOR_DRIFT) return null;
  const split = Math.floor(series.length / 2);
  const older = median(series.slice(0, split));
  const recent = median(series.slice(split));
  if (older <= 0) return null;
  return Math.round(((recent - older) / older) * 100);
}

export type JournalEntry = { label: string; runs: number; totalMs: number };

export type Journal = {
  /** The window this covers, as epoch ms. */
  from: number;
  to: number;
  commands: number;
  failures: number;
  /** Wall-clock spent inside commands, in ms. Not "time worked". */
  activeMs: number;
  /** First and last command in the window, or null when there were none. */
  firstAt: number | null;
  lastAt: number | null;
  /** What was run, by family, busiest first. */
  families: JournalEntry[];
  /** Where it ran, by directory, busiest first. */
  directories: JournalEntry[];
};

/**
 * Summarize a window of the ledger.
 *
 * `activeMs` is deliberately the sum of command durations and nothing more.
 * It is not a claim about hours worked — a long `pnpm dev` inflates it and
 * thinking time contributes nothing — and the panel labels it as time spent
 * running commands for exactly that reason. Inventing a "time worked" figure
 * from this data would be a claim the data cannot support.
 */
export function buildJournal(
  records: CommandRecord[],
  from: number,
  to: number,
): Journal {
  const inWindow = records.filter(
    (r) => r.startedAt >= from && r.startedAt <= to,
  );

  const families = new Map<string, JournalEntry>();
  const directories = new Map<string, JournalEntry>();
  const bump = (
    map: Map<string, JournalEntry>,
    label: string,
    ms: number,
  ) => {
    const entry = map.get(label);
    if (entry) {
      entry.runs += 1;
      entry.totalMs += ms;
    } else {
      map.set(label, { label, runs: 1, totalMs: ms });
    }
  };

  let activeMs = 0;
  let failures = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;

  for (const r of inWindow) {
    activeMs += r.durationMs;
    if (r.exitCode !== 0) failures += 1;
    if (firstAt === null || r.startedAt < firstAt) firstAt = r.startedAt;
    if (lastAt === null || r.startedAt > lastAt) lastAt = r.startedAt;
    bump(families, commandFamily(r.argv), r.durationMs);
    if (r.cwd.trim() !== "") bump(directories, r.cwd, r.durationMs);
  }

  const byRuns = (a: JournalEntry, b: JournalEntry) =>
    b.runs - a.runs || b.totalMs - a.totalMs;

  return {
    from,
    to,
    commands: inWindow.length,
    failures,
    activeMs,
    firstAt,
    lastAt,
    families: [...families.values()].sort(byRuns),
    directories: [...directories.values()].sort(byRuns),
  };
}

/** Start of the local day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
