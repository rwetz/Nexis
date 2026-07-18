---
type: map
description: The Tauri IPC seam — every command family, its Rust handler, and the frontend file that calls it.
---

# IPC surface (frontend ↔ Rust)

The full command registry is `tauri::generate_handler![...]` in `src-tauri/src/lib.rs` (~90 commands as of 2026-07 — that macro is the authoritative list; this note is the map of families and seams).

**Convention:** each family has one frontend "bridge" file that owns the `invoke()` calls. Don't scatter raw `invoke("cmd_x")` through components — go through (or extend) the bridge.

| Family | Commands (prefix) | Rust handler | Frontend seam |
|---|---|---|---|
| PTY | `pty_open/write/resize/close/cwd` | `modules/pty/mod.rs` | `terminal/lib/pty-bridge.ts` — see [[terminal-tab-open]] |
| Filesystem | `fs_*`, `list_subdirs` | `modules/fs/{file,tree,mutate,search,grep}.rs` | `ai/lib/native.ts` (AI tools), `editor/lib/useDocument.ts` |
| Git | `git_*` (25 cmds: status, diff, stage, commit, stash, worktree…) | `modules/git/commands.rs` | `ai/lib/native.ts`; source-control UI |
| Shell one-shots & sessions | `shell_run_command`, `shell_session_*`, `shell_bg_*`, `*_shell_history` | `modules/shell/mod.rs` | `ai/lib/native.ts`, `ai/tools/shell.ts`; also `editor/lib/formatter.ts`, `ports/`, `ssh/` |
| Workspace / WSL | `workspace_authorize`, `workspace_current_dir`, `wsl_*`, `get_launch_dir` | `modules/workspace.rs`, `lib.rs` | `workspace/env.ts`, `lib/launchDir.ts`, and every bridge that spawns with a cwd |
| Secrets | `secrets_get/set/delete/get_all` | `modules/secrets.rs` (OS keychain) | `ai/lib/keyring.ts` |
| LSP / DAP | `lsp_*`, `dap_*` | `modules/lsp/mod.rs`, `modules/dap/mod.rs` | `lsp/client.ts`, `debugger/debugSession.ts` |
| AI HTTP proxy | `ai_http_request`, `ai_http_stream`, `lm_ping` | `modules/net.rs` | `ai/lib/proxyFetch.ts` — see [[ai]] |
| ML engine | `ml_*` (11 cmds) | `modules/ml.rs` | `ml/lib/engine-bridge.ts` |
| Python | `py_detect_envs` | `modules/python.rs` | `python/usePythonEnv.ts`, `ml/store.ts` |
| Share server | `http_share_*` | `modules/http_share.rs` | `share/useShareServer.ts` |
| Recording | `save_cast_recording` | `modules/recording.rs` | `terminal/lib/useRecording.ts` |
| Session snapshots | `session_snapshot_save/load/delete/gc` | `modules/snapshots.rs` | `terminal/lib/snapshot-bridge.ts` |
| Editor autosave | `editor_autosave_write/read/delete/sweep` | `modules/autosave.rs` | `editor/lib/autosave-bridge.ts` |
| Crash reports | `list_crash_reports` | `modules/crash.rs` | (settings/diagnostics UI) |
| Diagnostics | `diagnostics_export` | `modules/diagnostics.rs` (hand-rolled store-only zip) | `settings/sections/GeneralSection.tsx` |

## Streaming: Channels, not events

High-volume data uses `tauri::ipc::Channel` passed as a command argument, not global events:

- `pty_open` takes `on_data: Channel<Response>` + `on_exit: Channel<i32>` (`pty/mod.rs`)
- `ai_http_stream` takes `on_event: Channel<AiStreamEvent>` (`net.rs`)

## Global events (`emit`/`listen`)

Low-volume broadcast only. Frontend-to-frontend cross-window sync: `nexis://prefs-changed` (see [[settings-sync]]), `nexis://ai-keys-changed`, `nexis://ai-agents-changed`, `nexis://ai-snippets-changed`, `nexis://code-snippets-changed`, `nexis://custom-themes-changed`, `nexis://theme-edit`. Rust→frontend: `lsp:workspace:applyEdit`, `ml:proto`, `ml:exit`.

## Sync vs async — main-thread rule

Tauri runs non-`async` commands **on the main thread**: while one runs, the UI event loop and every
queued IPC call (terminal keystrokes included) wait behind it. Anything that touches the filesystem,
walks directories, or spawns a process must be `pub async fn` with its body in
`crate::modules::heavy(move || { ... }).await` (`modules/mod.rs`, spawn_blocking under the hood) — the
fs/shell/ml/workspace/crash families all follow this as of 2026-07. Git uses its own registry-aware
`blocking()` helper in `git/commands.rs`; commands that take `State` re-fetch it from an `AppHandle`
inside the closure (see `shell_session_open`). Commands that only lock a map and return
(`pty_resize`, `pty_close`, `shell_bg_*`, `lsp_notify`, …) stay sync on purpose — don't cargo-cult
`heavy()` onto them. `pty_write` is a special case: sync but enqueue-only (see [[pty]]). `pty_cwd` is
sync on purpose too: a `/proc` readlink is a single non-blocking syscall, not disk I/O.

## Adding a command — checklist

1. `#[tauri::command]` fn in the right `modules/` file; subprocesses via `proc::command()` only (CLAUDE.md pitfall #4)
2. If it does I/O, walks dirs, or spawns anything: `async fn` + `modules::heavy()` (see "Sync vs async" above)
3. Register it in `generate_handler![]` in `lib.rs` (forgetting this = runtime "command not found")
4. Call it from the family's bridge file; if it takes a user-supplied cwd, call `workspace_authorize` first (pitfall #1C)
5. Big/streaming payloads → `Channel`, not events
