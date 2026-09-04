// Mirrors the serde shapes in src-tauri/src/{scan,tree}.rs. Field names are
// snake_case because that is what serde emits — kept verbatim rather than
// remapped, so a change on the Rust side breaks the typecheck here.

export type LangSlice = {
  lang: string;
  bytes: number;
  files: number;
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
  last_commit_time: number | null;
  last_commit_summary: string | null;
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
