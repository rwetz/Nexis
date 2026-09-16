---
type: subsystem
description: Workspace-scoped Git status, staging, commits, remotes, history, stashes, checkpoints, submodules, and worktrees through the user's Git CLI.
---

# Source control

Source Control is the write-capable Git view for the active workspace and the Git History tab family. It deliberately drives the user's `git` CLI so config, credential helpers, hooks, and worktree behavior match the terminal. Atlas is the separate read-only, host-wide libgit2 inventory.

## Key files

- `src/capabilities/git/index.tsx` / `context.tsx` — declarative Source Control panel and command plus workbench callbacks
- `src/capabilities/git/api.ts` — typed workspace-scoped frontend command surface for status, diff, writes, history, stashes, checkpoints, submodules, and worktrees
- `src/modules/source-control/useSourceControl.ts` — context-path repo resolution, status summary, focus refresh, remote throttling, and changed-file badge state
- `src/modules/source-control/useSourceControlPanel.ts` — panel selection, stage/unstage/discard, commit, push, and diff orchestration
- `src/modules/git-history/GitHistoryPane.tsx` — paged commit graph, commit files/diffs, and remote-web links
- `src-tauri/src/modules/git/{commands,operations,process}.rs` — async handlers, Git behavior, workspace routing, and confined CLI construction

## Invariants / gotchas

- Every Git operation is workspace-scoped. The frontend API must inject the active local/WSL environment; components must not call raw `invoke`, including worktree operations.
- Source Control must use the user's Git CLI, config, hooks, credentials, and filters. Do not replace writes with Atlas's libgit2 path.
- Auto-fetch is throttled per repository and remote failures are distinct from local status failures. A network error must not blank local changes.
- The badge uses a stable workspace fallback while the active panel and open Git tabs follow the contextual terminal/file/repository path. This prevents background tab changes from continuously re-running Git just to paint the rail count.
- Worktree open changes the active workspace; worktree add/remove stays within the selected repository's workspace environment.

## Debugging entry points

- Wrong host or distro → `capabilities/git/api.ts` and `platform/workspaces.ts:workspaceIpc`
- Panel is empty or stale → `source-control/useSourceControl.ts:doRefresh`
- Stage/commit selection mismatch → `source-control/useSourceControlPanel.ts`
- History graph or pagination error → `git-history/GitHistoryPane.tsx` and `git-history/lib/graph.ts`

## Related

[[atlas]] · [[platform]] · [[workbench]] · [[ipc-surface]]
