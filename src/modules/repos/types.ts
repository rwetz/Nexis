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
export type RepoDetail = {
  files: FileChange[];
  stashes: string[];
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
  clean:    { label: "clean",    dot: "bg-emerald-500",  text: "text-emerald-500" },
  dirty:    { label: "dirty",    dot: "bg-amber-400",    text: "text-amber-400" },
  ahead:    { label: "ahead",    dot: "bg-sky-400",      text: "text-sky-400" },
  behind:   { label: "behind",   dot: "bg-orange-400",   text: "text-orange-400" },
  diverged: { label: "diverged", dot: "bg-red-400",      text: "text-red-400" },
  conflict: { label: "conflict", dot: "bg-destructive",  text: "text-destructive" },
  error:    { label: "error",    dot: "bg-destructive",  text: "text-destructive" },
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
): RepoSummary[] {
  if (mode === "map") return repos;
  return [...repos].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}
