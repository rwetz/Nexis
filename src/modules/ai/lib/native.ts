// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";

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

export const native = {
  workspaceCurrentDir: () => invoke<string>("workspace_current_dir"),
  workspaceAuthorize: (path: string) =>
    invoke<string>("workspace_authorize", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  readFile: (path: string) =>
    invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  // Combined canonicalize + AI safety check + read — saves one IPC
  // round-trip vs the separate fs_canonicalize → fs_read_file pattern.
  readFileAi: (path: string) =>
    invoke<ReadAiResult>("fs_read_file_ai", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  writeFile: (path: string, content: string) =>
    invoke<void>("fs_write_file", {
      path,
      content,
      workspace: currentWorkspaceEnv(),
    }),
  canonicalize: (path: string) =>
    invoke<string>("fs_canonicalize", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  createFile: (path: string) =>
    invoke<void>("fs_create_file", { path, workspace: currentWorkspaceEnv() }),
  createDir: (path: string) =>
    invoke<void>("fs_create_dir", { path, workspace: currentWorkspaceEnv() }),
  // AI tooling never sees dot-prefixed entries regardless of the user's
  // explorer preference — keeps .git / .env / .ssh out of agent context.
  readDir: (path: string) =>
    invoke<DirEntry[]>("fs_read_dir", {
      path,
      showHidden: false,
      workspace: currentWorkspaceEnv(),
    }),
  grep: (params: {
    pattern: string;
    root: string;
    glob?: string[];
    caseInsensitive?: boolean;
    maxResults?: number;
  }) =>
    invoke<GrepResponse>("fs_grep", {
      pattern: params.pattern,
      root: params.root,
      glob: params.glob ?? null,
      caseInsensitive: params.caseInsensitive ?? null,
      maxResults: params.maxResults ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  glob: (params: { pattern: string; root: string; maxResults?: number }) =>
    invoke<GlobResponse>("fs_glob", {
      pattern: params.pattern,
      root: params.root,
      maxResults: params.maxResults ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  runCommand: (
    command: string,
    cwd?: string | null,
    timeoutSecs?: number,
  ) =>
    invoke<CommandOutput>("shell_run_command", {
      command,
      cwd: cwd ?? null,
      timeoutSecs: timeoutSecs ?? null,
      workspace: currentWorkspaceEnv(),
    }),

  shellSessionOpen: (cwd?: string | null) =>
    invoke<number>("shell_session_open", {
      cwd: cwd ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellSessionRun: (
    id: number,
    command: string,
    cwd?: string | null,
    timeoutSecs?: number,
  ) =>
    invoke<{
      stdout: string;
      stderr: string;
      exit_code: number | null;
      timed_out: boolean;
      truncated: boolean;
      cwd_after: string;
    }>("shell_session_run", {
      id,
      command,
      cwd: cwd ?? null,
      timeoutSecs: timeoutSecs ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellSessionClose: (id: number) =>
    invoke<void>("shell_session_close", { id }),
  shellBgSpawn: (command: string, cwd?: string | null) =>
    invoke<number>("shell_bg_spawn", {
      command,
      cwd: cwd ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellBgLogs: (handle: number, sinceOffset?: number) =>
    invoke<{
      bytes: string;
      next_offset: number;
      dropped: number;
      exited: boolean;
      exit_code: number | null;
    }>("shell_bg_logs", { handle, sinceOffset: sinceOffset ?? null }),
  shellBgKill: (handle: number) => invoke<void>("shell_bg_kill", { handle }),
  /**
   * Start watching a directory for the explorer. Resolves `false` when the
   * watch could NOT be established (watch-descriptor exhaustion is the common
   * case on large trees) — callers must fall back to polling rather than
   * assuming success.
   */
  fsWatchStart: (path: string) => invoke<boolean>("fs_watch_start", { path }),
  fsWatchStop: () => invoke<void>("fs_watch_stop"),
  /** One poll of the system-resource analyzer (see `modules/sysmon`). */
  sysmonSample: (sort?: SysmonSort, includeProcesses?: boolean) =>
    invoke<SysSample>("sysmon_sample", {
      sort: sort ?? null,
      includeProcesses: includeProcesses ?? null,
    }),
  /** Returns false when the pid is already gone — a normal poll-interval race. */
  sysmonKill: (pid: number, signal?: SysmonSignal) =>
    invoke<boolean>("sysmon_kill", { pid, signal: signal ?? null }),
  shellBgList: () =>
    invoke<
      {
        handle: number;
        command: string;
        cwd: string | null;
        started_at_ms: number;
        exited: boolean;
        exit_code: number | null;
      }[]
    >("shell_bg_list"),
  /** Snapshot the tree before an agent edit. Null = clean tree, nothing to save. */
  gitCheckpointCreate: (repoRoot: string, label: string) =>
    invoke<GitCheckpoint | null>("git_checkpoint_create", {
      repoRoot,
      label,
      workspace: currentWorkspaceEnv(),
    }),
  gitCheckpointList: (repoRoot: string) =>
    invoke<GitCheckpoint[]>("git_checkpoint_list", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitCheckpointRestore: (repoRoot: string, refName: string) =>
    invoke<void>("git_checkpoint_restore", {
      repoRoot,
      refName,
      workspace: currentWorkspaceEnv(),
    }),
  gitCheckpointDelete: (repoRoot: string, refName: string) =>
    invoke<void>("git_checkpoint_delete", {
      repoRoot,
      refName,
      workspace: currentWorkspaceEnv(),
    }),
  gitResolveRepo: (cwd: string) =>
    invoke<GitRepoInfo | null>("git_resolve_repo", {
      cwd,
      workspace: currentWorkspaceEnv(),
    }),
  gitPanelSnapshot: (cwd: string) =>
    invoke<GitPanelSnapshot>("git_panel_snapshot", {
      cwd,
      workspace: currentWorkspaceEnv(),
    }),
  gitStatus: (repoRoot: string) =>
    invoke<GitStatusSnapshot>("git_status", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitDiff: (repoRoot: string, path: string | null, staged: boolean) =>
    invoke<GitDiffResult>("git_diff", {
      repoRoot,
      path,
      staged,
      workspace: currentWorkspaceEnv(),
    }),
  gitDiffContent: (
    repoRoot: string,
    path: string,
    staged: boolean,
    originalPath?: string | null,
  ) =>
    invoke<GitDiffContentResult>("git_diff_content", {
      repoRoot,
      path,
      staged,
      originalPath: originalPath ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitStage: (repoRoot: string, paths: string[]) =>
    invoke<void>("git_stage", {
      repoRoot,
      paths,
      workspace: currentWorkspaceEnv(),
    }),
  gitUnstage: (repoRoot: string, paths: string[]) =>
    invoke<void>("git_unstage", {
      repoRoot,
      paths,
      workspace: currentWorkspaceEnv(),
    }),
  gitDiscard: (repoRoot: string, entries: GitDiscardEntry[]) =>
    invoke<void>("git_discard", {
      repoRoot,
      entries,
      workspace: currentWorkspaceEnv(),
    }),
  gitCommit: (repoRoot: string, message: string) =>
    invoke<GitCommitResult>("git_commit", {
      repoRoot,
      message,
      workspace: currentWorkspaceEnv(),
    }),
  gitBranches: (repoRoot: string) =>
    invoke<GitBranchEntry[]>("git_branches", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitCheckoutBranch: (repoRoot: string, branch: string) =>
    invoke<void>("git_checkout_branch", {
      repoRoot,
      branch,
      workspace: currentWorkspaceEnv(),
    }),
  gitFetch: (repoRoot: string) =>
    invoke<void>("git_fetch", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitPullFfOnly: (repoRoot: string) =>
    invoke<void>("git_pull_ff_only", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitPush: (repoRoot: string) =>
    invoke<GitPushResult>("git_push", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitLog: (repoRoot: string, options?: { limit?: number; beforeSha?: string }) =>
    invoke<GitLogEntry[]>("git_log", {
      repoRoot,
      limit: options?.limit ?? null,
      beforeSha: options?.beforeSha ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitShowCommit: (repoRoot: string, sha: string) =>
    invoke<GitDiffResult>("git_show_commit", {
      repoRoot,
      sha,
      workspace: currentWorkspaceEnv(),
    }),
  gitCommitFiles: (repoRoot: string, sha: string) =>
    invoke<GitCommitFileChange[]>("git_commit_files", {
      repoRoot,
      sha,
      workspace: currentWorkspaceEnv(),
    }),
  gitCommitFileDiff: (
    repoRoot: string,
    sha: string,
    path: string,
    originalPath?: string | null,
  ) =>
    invoke<GitDiffContentResult>("git_commit_file_diff", {
      repoRoot,
      sha,
      path,
      originalPath: originalPath ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitRemoteUrl: (repoRoot: string, name?: string) =>
    invoke<string | null>("git_remote_url", {
      repoRoot,
      name: name ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitSubmoduleStatus: (repoRoot: string) =>
    invoke<GitSubmoduleEntry[]>("git_submodule_status", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitStashList: (repoRoot: string) =>
    invoke<GitStashEntry[]>("git_stash_list", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitStashPush: (repoRoot: string, message?: string) =>
    invoke<void>("git_stash_push", {
      repoRoot,
      message: message ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitStashApply: (repoRoot: string, stashRef: string) =>
    invoke<void>("git_stash_apply", {
      repoRoot,
      stashRef,
      workspace: currentWorkspaceEnv(),
    }),
  gitStashPop: (repoRoot: string, stashRef: string) =>
    invoke<void>("git_stash_pop", {
      repoRoot,
      stashRef,
      workspace: currentWorkspaceEnv(),
    }),
  gitStashDrop: (repoRoot: string, stashRef: string) =>
    invoke<void>("git_stash_drop", {
      repoRoot,
      stashRef,
      workspace: currentWorkspaceEnv(),
    }),

  // ── LSP ────────────────────────────────────────────────────────────────────
  lspStart: (opts: {
    serverCmd: string;
    serverArgs: string[];
    workspaceRoot: string;
    initializationOptions?: Record<string, unknown> | null;
  }) => invoke<number>("lsp_start", { ...opts, initializationOptions: opts.initializationOptions ?? null }),
  lspRequest: (sessionId: number, method: string, params?: unknown) =>
    invoke<unknown>("lsp_request", { sessionId, method, params: params ?? null }),
  lspNotify: (sessionId: number, method: string, params?: unknown) =>
    invoke<void>("lsp_notify", { sessionId, method, params: params ?? null }),
  lspStop: (sessionId: number) => invoke<void>("lsp_stop", { sessionId }),

  // ── DAP ────────────────────────────────────────────────────────────────────
  dapStart: (opts: {
    adapterCmd: string;
    adapterArgs: string[];
    adapterId: string;
  }) => invoke<number>("dap_start", opts),
  dapRequest: (sessionId: number, command: string, arguments_?: unknown) =>
    invoke<unknown>("dap_request", { sessionId, command, arguments: arguments_ ?? null }),
  dapStop: (sessionId: number) => invoke<void>("dap_stop", { sessionId }),
  dapSessions: () => invoke<number[]>("dap_sessions"),
};
