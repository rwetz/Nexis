// Mirrors the serde shapes in src-tauri/src/{scan,tree,detail}.rs. Field names
// are snake_case because that is what serde emits — kept verbatim rather than
// remapped, so a change on the Rust side breaks the typecheck here.
//
// One `RepoSummary` serves both views. The list reads the git half, the map
// reads the size half, and a single scan fills in all of it.

export type LangSlice = {
  lang: string;
  bytes: number;
  files: number;
};

export type CommitInfo = {
  summary: string;
  author: string;
  /** unix seconds */
  time: number;
  hash: string;
};

export type RepoSummary = {
  path: string;
  name: string;
  branch: string;
  detached: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  ahead: number;
  behind: number;
  upstream: string | null;
  stash_count: number;
  last_commit: CommitInfo | null;
  files: number;
  dirs: number;
  bytes: number;
  langs: LangSlice[];
  truncated: boolean;
  error: string | null;
  health: RepoHealth;
};

/** Mirrors `health.rs`. Each local branch lands in at most one bucket:
 *  merged, then gone, then inactive. */
export type RepoHealth = {
  default_branch: string | null;
  merged_branches: string[];
  gone_branches: string[];
  inactive_branches: string[];
  worktrees: number;
  /** `owner/name` when the origin is on github.com. */
  github: string | null;
};

/** Mirrors `prs.rs`. */
export type PrCounts = {
  total: number;
  dependabot: number;
  human: number;
};

export type PrReport = {
  available: boolean;
  reason: string | null;
  counts: Record<string, PrCounts>;
  fetched_at: number | null;
};

export type AtlasResult = {
  repos: RepoSummary[];
  elapsed_ms: number;
  config_path: string;
  scan_root: string | null;
};

export type TreeNode = {
  name: string;
  /** Repo-relative, `/`-separated. Empty string for the root. */
  path: string;
  is_dir: boolean;
  bytes: number;
  lines: number;
  lang: string;
  /** Working-tree state letter (M A D R T C ?) — files only. */
  status: string | null;
  dirty: number;
  children: TreeNode[];
};

export type FileChange = {
  path: string;
  index: string | null;
  worktree: string | null;
  conflicted: boolean;
};

/** The list view's drill-in. Pairs with the `RepoSummary` already in the
 *  store — the backend deliberately does not send that twice. */
/** One day's commit count. `date` is `YYYY-MM-DD` in the committing author's
 *  own timezone, matching what `git log --format=%ad` reports. Only days with
 *  at least one commit are present; the heatmap fills the gaps. */
export type ActivityDay = {
  date: string;
  count: number;
};

export type RepoDetail = {
  files: FileChange[];
  stashes: string[];
  activity: ActivityDay[];
};

export type RepoCity = {
  summary: RepoSummary;
  root: TreeNode;
  elapsed_ms: number;
};

export function dirtyCount(r: RepoSummary): number {
  return r.staged + r.unstaged + r.untracked + r.conflicted;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

const STATUS_LABEL: Record<string, string> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  T: "type changed",
  C: "conflicted",
  "?": "untracked",
};

export function statusLabel(code: string | null): string | null {
  return code ? (STATUS_LABEL[code] ?? code) : null;
}

/** Relative time from a unix-seconds timestamp, e.g. "3d ago". */
export function relativeTime(unixSeconds: number | null): string {
  if (unixSeconds === null) return "never";
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "just now";
  const steps: [number, string][] = [
    [60, "m"],
    [3600, "h"],
    [86400, "d"],
    [86400 * 30, "mo"],
    [86400 * 365, "y"],
  ];
  let unit = "m";
  let value = diff / 60;
  for (const [seconds, label] of steps) {
    if (diff >= seconds) {
      unit = label;
      value = diff / seconds;
    }
  }
  return `${Math.floor(value)}${unit} ago`;
}

// ── Repo state, as the list view colours it ────────────────────────────────

export type RepoState =
  | "error"
  | "conflict"
  | "dirty"
  | "diverged"
  | "behind"
  | "ahead"
  | "clean";

export function repoState(r: RepoSummary): RepoState {
  if (r.error) return "error";
  if (r.conflicted > 0) return "conflict";
  if (dirtyCount(r) > 0) return "dirty";
  if (r.ahead > 0 && r.behind > 0) return "diverged";
  if (r.behind > 0) return "behind";
  if (r.ahead > 0) return "ahead";
  return "clean";
}

export const STATE_META: Record<
  RepoState,
  { label: string; dot: string; text: string }
> = {
  clean:    { label: "clean",    dot: "bg-success",  text: "text-success" },
  dirty:    { label: "dirty",    dot: "bg-warning",    text: "text-warning" },
  ahead:    { label: "ahead",    dot: "bg-info",      text: "text-info" },
  behind:   { label: "behind",   dot: "bg-warning",   text: "text-warning" },
  diverged: { label: "diverged", dot: "bg-destructive",      text: "text-destructive" },
  conflict: { label: "conflict", dot: "bg-destructive",  text: "text-destructive" },
  error:    { label: "error",    dot: "bg-destructive",  text: "text-destructive" },
};

// ── Repo hygiene: what "needs attention" means ─────────────────────────────

export function staleBranchCount(r: RepoSummary): number {
  const h = r.health;
  return h.merged_branches.length + h.gone_branches.length + h.inactive_branches.length;
}

/** Open PRs for a repo, or null when it is not on GitHub or `gh` has not
 *  answered (offline, not installed, still loading). */
export function prsFor(
  r: RepoSummary,
  prs: Record<string, PrCounts>,
): PrCounts | null {
  return r.health.github ? (prs[r.health.github] ?? null) : null;
}

export type AttentionKind = "changes" | "branches" | "worktrees" | "prs";

export type AttentionItem = { kind: AttentionKind; count: number; label: string };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Every reason a repo wants tidying, in the order the list shows them.
 *  Ahead/behind is deliberately not here: that is sync, and has its column. */
export function attentionItems(
  r: RepoSummary,
  prs: Record<string, PrCounts>,
): AttentionItem[] {
  if (r.error) return [];
  const out: AttentionItem[] = [];
  const dirty = dirtyCount(r);
  if (dirty > 0) {
    out.push({ kind: "changes", count: dirty, label: plural(dirty, "uncommitted file") });
  }
  const stale = staleBranchCount(r);
  if (stale > 0) {
    out.push({ kind: "branches", count: stale, label: plural(stale, "stale branch", "stale branches") });
  }
  if (r.health.worktrees > 0) {
    const n = r.health.worktrees;
    out.push({ kind: "worktrees", count: n, label: plural(n, "linked worktree") });
  }
  const pr = prsFor(r, prs);
  if (pr && pr.total > 0) {
    const split = pr.dependabot > 0 ? ` (${pr.dependabot} Dependabot)` : "";
    out.push({ kind: "prs", count: pr.total, label: `${plural(pr.total, "open PR")}${split}` });
  }
  return out;
}

/** The cleanup the map can't already show: everything but uncommitted
 *  files, which have their own coral tint. Drives the map's beacon. */
export function hygieneCount(r: RepoSummary, prs: Record<string, PrCounts>): number {
  return attentionItems(r, prs)
    .filter((i) => i.kind !== "changes")
    .reduce((t, i) => t + i.count, 0);
}

/** Sort weight for "most in need of attention first". Files are cheap and
 *  numerous, so they count for less than a branch or a waiting PR. */
export function attentionScore(r: RepoSummary, prs: Record<string, PrCounts>): number {
  let score = 0;
  for (const i of attentionItems(r, prs)) {
    score += i.kind === "changes" ? Math.min(i.count, 20) * 0.5 : i.count * 2;
  }
  return score;
}

export type ListSort = "name" | "changes" | "attention" | "recent";

/** How the list is arranged. The map ignores all of it: its treemap needs
 *  the scan's own order. */
export type ListView = {
  sort: ListSort;
  attentionOnly: boolean;
  prs: Record<string, PrCounts>;
};

export const DEFAULT_LIST_VIEW: ListView = {
  sort: "name",
  attentionOnly: false,
  prs: {},
};

/** Which way the repos are ordered on screen, per view.
 *
 *  The backend returns them biggest-first because the map's squarified
 *  treemap needs descending weight and a stable order keeps islands from
 *  hopping between refreshes. A table of repos wants to be alphabetical.
 *  Keyboard selection walks whichever order is actually on screen, so both
 *  the rows and `moveSelection` read this. */
export function displayOrder(
  repos: RepoSummary[],
  mode: "list" | "map",
  view: ListView = DEFAULT_LIST_VIEW,
): RepoSummary[] {
  if (mode === "map") return repos;
  const { prs } = view;
  const rows = view.attentionOnly
    ? repos.filter((r) => attentionItems(r, prs).length > 0)
    : [...repos];
  const byName = (a: RepoSummary, b: RepoSummary) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  // Every non-name sort is descending ("most first") with the name as the
  // tiebreak, so equal rows stay in a stable, readable order.
  const desc = (key: (r: RepoSummary) => number) => (a: RepoSummary, b: RepoSummary) =>
    key(b) - key(a) || byName(a, b);
  switch (view.sort) {
    case "changes":
      return rows.sort(desc(dirtyCount));
    case "attention":
      return rows.sort(desc((r) => attentionScore(r, prs)));
    case "recent":
      return rows.sort(desc((r) => r.last_commit?.time ?? -Infinity));
    default:
      return rows.sort(byName);
  }
}

/** Find a repo by a path that came from somewhere else — a deep link, a config
 *  file, another app.
 *
 *  Two kinds of forgiveness, both earned from real senders:
 *
 *  Separators and drive-letter case vary between whoever wrote the path and
 *  whoever scanned it, so the comparison is on a normalized form rather than
 *  requiring the two strings to be identical.
 *
 *  And the path may point *inside* a repo rather than at its root — Nexis, for
 *  one, knows a terminal's working directory long before it knows which repo
 *  contains it. So a path under a scanned repo resolves to that repo. The
 *  longest match wins, which is what makes nested repos (a submodule, a repo
 *  inside a monorepo) resolve to the innermost one rather than its parent.
 */
export function findByPath(
  repos: RepoSummary[],
  path: string,
): RepoSummary | null {
  const norm = (p: string) =>
    p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const want = norm(path);

  let best: RepoSummary | null = null;
  let bestLen = -1;
  for (const r of repos) {
    const root = norm(r.path);
    // Exact, or `want` sits under `root`. The trailing "/" matters: without it
    // "/dev/nexis-atlas" would look like it contains "/dev/nexis".
    if (want !== root && !want.startsWith(root + "/")) continue;
    if (root.length > bestLen) {
      best = r;
      bestLen = root.length;
    }
  }
  return best;
}
