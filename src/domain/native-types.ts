export type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

/** Result of the combined canonicalize+check+read command used by AI tools. */
export type ReadAiResult =
  | { kind: "text"; canonical: string; content: string; size: number }
  | { kind: "binary"; canonical: string; size: number }
  | { kind: "toolarge"; canonical: string; size: number; limit: number }
  | { kind: "refused"; reason: string };

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
};

/** Sort keys for the system-monitor process table. Sorting happens in Rust so
 *  that truncation keeps the rows the user asked to see (see `sysmon.rs`). */
export type SysmonSort = "cpu" | "memory" | "pid" | "name";

/** Signals the system-monitor panel may send. A closed set by design — see
 *  the `KillSignal` enum in `sysmon.rs`. */
export type SysmonSignal = "term" | "kill" | "int" | "hup";

export type SysProcessRow = {
  pid: number;
  parent: number | null;
  name: string;
  cmd: string;
  /** Percent of ONE core, `top`-style — can exceed 100 on a threaded process. */
  cpu: number;
  memory: number;
  run_time: number;
};

export type SysDiskRow = {
  name: string;
  mount_point: string;
  total: number;
  available: number;
  read_per_sec: number;
  written_per_sec: number;
};

export type SysNetRow = {
  interface: string;
  rx_per_sec: number;
  tx_per_sec: number;
  rx_total: number;
  tx_total: number;
};

export type SysSample = {
  cpu_total: number;
  cpu_per_core: number[];
  mem_total: number;
  mem_used: number;
  mem_available: number;
  swap_total: number;
  swap_used: number;
  load_avg: [number, number, number];
  uptime: number;
  disks: SysDiskRow[];
  networks: SysNetRow[];
  processes: SysProcessRow[];
  /** True process count before truncation to the row cap. */
  process_count: number;
  /** Zero on the first sample, whose rates are all meaningless. */
  elapsed_ms: number;
};

/** A pre-edit snapshot (see `git/operations.rs` checkpoint section). */
export type GitCheckpoint = {
  refName: string;
  sha: string;
  label: string;
  timestampSecs: number;
};

export type CommandOutput = {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
};

export type GrepHit = {
  path: string;
  rel: string;
  line: number;
  text: string;
};

export type GrepResponse = {
  hits: GrepHit[];
  truncated: boolean;
  files_scanned: number;
};

export type GlobHit = { path: string; rel: string };

export type GlobResponse = { hits: GlobHit[]; truncated: boolean };

export type FileSearchHit = {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
};

export type FileSearchResponse = {
  hits: FileSearchHit[];
  truncated: boolean;
};

export type ListFilesResult = {
  files: string[];
  truncated: boolean;
};

export type GitRepoInfo = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  isDetached: boolean;
};

export type GitChangedFile = {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusLabel: string;
};

export type GitStatusSnapshot = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  isDetached: boolean;
  truncated: boolean;
  changedFiles: GitChangedFile[];
};

export type GitDiffResult = {
  diffText: string;
  truncated: boolean;
};

export type GitDiffContentResult = {
  originalContent: string;
  modifiedContent: string;
  isBinary: boolean;
  fallbackPatch: string;
  truncated: boolean;
};

export type GitCommitResult = {
  commitSha: string;
  summary: string;
};

export type GitPushResult = {
  remote: string | null;
  branch: string | null;
  pushed: boolean;
};

export type GitLogEntry = {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  timestampSecs: number;
  parents: string[];
  subject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type GitCommitFileChange = {
  path: string;
  originalPath: string | null;
  status: string;
  statusLabel: string;
  added: number;
  removed: number;
  isBinary: boolean;
};

export type GitPanelSnapshot = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
};

export type GitStashEntry = {
  index: number;
  refName: string;
  message: string;
  timestampSecs: number;
};

export type GitBranchEntry = {
  name: string;
  current: boolean;
};

export type GitWorktreeEntry = {
  path: string;
  sha: string;
  branch: string;
  isMain: boolean;
  isDetached: boolean;
  isPrunable: boolean;
};

export type GitSubmoduleEntry = {
  path: string;
  name: string;
  sha: string;
  status: "ok" | "modified" | "uninitialized" | "conflict";
};

export type GitDiscardEntry = {
  path: string;
  untracked: boolean;
};
