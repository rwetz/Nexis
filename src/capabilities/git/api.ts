import { workspaceIpc } from "@/platform/workspaces";
import { defineCommand } from "@/platform/ipc";

import type {
  GitCheckpoint,
  GitRepoInfo,
  GitStatusSnapshot,
  GitDiffResult,
  GitDiffContentResult,
  GitCommitResult,
  GitPushResult,
  GitLogEntry,
  GitActivityDay,
  GitCommitFileChange,
  GitPanelSnapshot,
  GitStashEntry,
  GitBranchEntry,
  GitSubmoduleEntry,
  GitDiscardEntry,
  GitWorktreeEntry,
} from "@/domain/native-types";

export const git = {
  gitCheckpointCreate: (repoRoot: string, label: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; label: string }, GitCheckpoint | null>(
        "git_checkpoint_create",
        "workspace",
      ),
      { repoRoot, label },
    ),
  gitCheckpointList: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, GitCheckpoint[]>(
        "git_checkpoint_list",
        "workspace",
      ),
      { repoRoot },
    ),
  gitCheckpointRestore: (repoRoot: string, refName: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; refName: string }, void>(
        "git_checkpoint_restore",
        "workspace",
      ),
      { repoRoot, refName },
    ),
  gitCheckpointDelete: (repoRoot: string, refName: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; refName: string }, void>(
        "git_checkpoint_delete",
        "workspace",
      ),
      { repoRoot, refName },
    ),
  gitResolveRepo: (cwd: string) =>
    workspaceIpc.call(
      defineCommand<{ cwd: string }, GitRepoInfo | null>(
        "git_resolve_repo",
        "workspace",
      ),
      { cwd },
    ),
  gitPanelSnapshot: (cwd: string) =>
    workspaceIpc.call(
      defineCommand<{ cwd: string }, GitPanelSnapshot>(
        "git_panel_snapshot",
        "workspace",
      ),
      { cwd },
    ),
  gitStatus: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, GitStatusSnapshot>(
        "git_status",
        "workspace",
      ),
      { repoRoot },
    ),
  gitDiff: (repoRoot: string, path: string | null, staged: boolean) =>
    workspaceIpc.call(
      defineCommand<
        { repoRoot: string; path: string | null; staged: boolean },
        GitDiffResult
      >("git_diff", "workspace"),
      { repoRoot, path, staged },
    ),
  gitDiffContent: (
    repoRoot: string,
    path: string,
    staged: boolean,
    originalPath?: string | null,
  ) =>
    workspaceIpc.call(
      defineCommand<
        {
          repoRoot: string;
          path: string;
          staged: boolean;
          originalPath: string | null;
        },
        GitDiffContentResult
      >("git_diff_content", "workspace"),
      { repoRoot, path, staged, originalPath: originalPath ?? null },
    ),
  gitStage: (repoRoot: string, paths: string[]) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; paths: string[] }, void>(
        "git_stage",
        "workspace",
      ),
      { repoRoot, paths },
    ),
  gitUnstage: (repoRoot: string, paths: string[]) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; paths: string[] }, void>(
        "git_unstage",
        "workspace",
      ),
      { repoRoot, paths },
    ),
  gitDiscard: (repoRoot: string, entries: GitDiscardEntry[]) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; entries: GitDiscardEntry[] }, void>(
        "git_discard",
        "workspace",
      ),
      { repoRoot, entries },
    ),
  gitCommit: (repoRoot: string, message: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; message: string }, GitCommitResult>(
        "git_commit",
        "workspace",
      ),
      { repoRoot, message },
    ),
  gitBranches: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, GitBranchEntry[]>(
        "git_branches",
        "workspace",
      ),
      { repoRoot },
    ),
  gitCheckoutBranch: (repoRoot: string, branch: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; branch: string }, void>(
        "git_checkout_branch",
        "workspace",
      ),
      { repoRoot, branch },
    ),
  gitFetch: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, void>("git_fetch", "workspace"),
      { repoRoot },
    ),
  gitPullFfOnly: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, void>(
        "git_pull_ff_only",
        "workspace",
      ),
      { repoRoot },
    ),
  gitPush: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, GitPushResult>(
        "git_push",
        "workspace",
      ),
      { repoRoot },
    ),
  gitActivity: (repoRoot: string, days?: number) =>
    workspaceIpc.call(
      defineCommand<
        { repoRoot: string; days: number | null },
        GitActivityDay[]
      >("git_activity", "workspace"),
      { repoRoot, days: days ?? null },
    ),
  gitLog: (
    repoRoot: string,
    options?: { limit?: number; beforeSha?: string },
  ) =>
    workspaceIpc.call(
      defineCommand<
        { repoRoot: string; limit: number | null; beforeSha: string | null },
        GitLogEntry[]
      >("git_log", "workspace"),
      {
        repoRoot,
        limit: options?.limit ?? null,
        beforeSha: options?.beforeSha ?? null,
      },
    ),
  gitShowCommit: (repoRoot: string, sha: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; sha: string }, GitDiffResult>(
        "git_show_commit",
        "workspace",
      ),
      { repoRoot, sha },
    ),
  gitCommitFiles: (repoRoot: string, sha: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; sha: string }, GitCommitFileChange[]>(
        "git_commit_files",
        "workspace",
      ),
      { repoRoot, sha },
    ),
  gitCommitFileDiff: (
    repoRoot: string,
    sha: string,
    path: string,
    originalPath?: string | null,
  ) =>
    workspaceIpc.call(
      defineCommand<
        {
          repoRoot: string;
          sha: string;
          path: string;
          originalPath: string | null;
        },
        GitDiffContentResult
      >("git_commit_file_diff", "workspace"),
      { repoRoot, sha, path, originalPath: originalPath ?? null },
    ),
  gitRemoteUrl: (repoRoot: string, name?: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; name: string | null }, string | null>(
        "git_remote_url",
        "workspace",
      ),
      { repoRoot, name: name ?? null },
    ),
  gitSubmoduleStatus: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, GitSubmoduleEntry[]>(
        "git_submodule_status",
        "workspace",
      ),
      { repoRoot },
    ),
  gitStashList: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, GitStashEntry[]>(
        "git_stash_list",
        "workspace",
      ),
      { repoRoot },
    ),
  gitStashPush: (repoRoot: string, message?: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; message: string | null }, void>(
        "git_stash_push",
        "workspace",
      ),
      { repoRoot, message: message ?? null },
    ),
  gitStashApply: (repoRoot: string, stashRef: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; stashRef: string }, void>(
        "git_stash_apply",
        "workspace",
      ),
      { repoRoot, stashRef },
    ),
  gitStashPop: (repoRoot: string, stashRef: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; stashRef: string }, void>(
        "git_stash_pop",
        "workspace",
      ),
      { repoRoot, stashRef },
    ),
  gitStashDrop: (repoRoot: string, stashRef: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; stashRef: string }, void>(
        "git_stash_drop",
        "workspace",
      ),
      { repoRoot, stashRef },
    ),
  gitWorktreeList: (repoRoot: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string }, GitWorktreeEntry[]>(
        "git_worktree_list",
        "workspace",
      ),
      { repoRoot },
    ),
  gitWorktreeAdd: (
    repoRoot: string,
    path: string,
    branch: string,
    newBranch: boolean,
  ) =>
    workspaceIpc.call(
      defineCommand<
        { repoRoot: string; path: string; branch: string; newBranch: boolean },
        void
      >("git_worktree_add", "workspace"),
      { repoRoot, path, branch, newBranch },
    ),
  gitWorktreeRemove: (repoRoot: string, path: string) =>
    workspaceIpc.call(
      defineCommand<{ repoRoot: string; path: string }, void>(
        "git_worktree_remove",
        "workspace",
      ),
      { repoRoot, path },
    ),
};
