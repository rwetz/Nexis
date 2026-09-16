---
type: map
description: The Tauri IPC seam — every command family, its Rust handler, and the frontend file that calls it.
---

# IPC surface (frontend ↔ Rust)

The full command registry is `tauri::generate_handler![...]` in `src-tauri/src/lib.rs` (145 commands verified 2026-09-14; that macro is the authoritative list). See [[architecture-boundaries]] for the reproducible call-site inventory and migration ownership.

**Intended convention:** call through the family's frontend bridge rather than scattering raw `invoke("cmd_x")` through components. `platform/ipc.ts` owns typed scope injection and event lifetimes; `platform/tauri.ts` is the raw transport. Phase 3 deleted the cross-domain `ai/lib/native.ts` bridge. Capability-specific raw calls still exist in the remaining Phase 4 terminal and integration queue.

| Family | Commands (prefix) | Rust handler | Frontend seam |
|---|---|---|---|
| PTY | `pty_open/write/resize/close/cwd` | `modules/pty/mod.rs` | typed workspace/host descriptors plus channels in `terminal/lib/pty-bridge.ts` — see [[terminal-tab-open]] |
| Filesystem | `fs_*`, `list_subdirs` | `modules/fs/{file,tree,mutate,search,grep}.rs` | `platform/filesystem.ts`; AI-only read policy in `ai/lib/filesystem.ts` |
| Git | `git_*` (status, diff, stage, commit, stash, worktree…) | `modules/git/commands.rs` | `capabilities/git/api.ts` |
| Shell one-shots & sessions | `shell_run_command`, `shell_session_*`, `shell_bg_*`, `*_shell_history` | `modules/shell/mod.rs` | `platform/processes.ts`, `ai/tools/shell.ts`; terminal suggestions use a typed host descriptor; ports/SSH remain on the integration queue |
| Workspace / WSL | `workspace_authorize`, `workspace_current_dir`, `wsl_*`, `get_launch_dir` | `modules/workspace.rs`, `lib.rs` | `platform/workspace-state.ts`, `lib/launchDir.ts`, and every bridge that spawns with a cwd |
| Secrets | `secrets_get/set/delete/get_all` | `modules/secrets.rs` (OS keychain) | `platform/secrets.ts` → `ai/lib/keyring.ts` |
| LSP / DAP | `lsp_*`, `dap_*` | `modules/lsp/mod.rs`, `modules/dap/mod.rs` | `capabilities/lsp/api.ts` → `lsp/client.ts`; `capabilities/debugger/api.ts` → `debugger/debugSession.ts` |
| HTTP | `ai_http_request`, `ai_http_stream`, `lm_ping`, `http_send` | `modules/net.rs` | `platform/http-stream.ts` → `ai/lib/proxyFetch.ts`; Web Dev remains on the integration migration queue — see [[ai]], [[web-dev-pack]] |
| ML engine | `ml_*` | `modules/ml.rs` | `ml/lib/engine-bridge.ts` |
| Python | `py_detect_envs` | `modules/python.rs` | `python/usePythonEnv.ts`, `ml/store.ts` |
| Share server | `http_share_*` (start takes `bind` + `token`; `http_share_lan_ip` probes the primary LAN IP) | `modules/http_share.rs` | `share/useShareServer.ts` (global Zustand store — sharing survives panel close) |
| Recording | `save_cast_recording` | `modules/recording.rs` | typed host descriptor in `terminal/lib/useRecording.ts` |
| Session snapshots | `session_snapshot_save/load/delete/gc` | `modules/snapshots.rs` | typed host descriptors in `terminal/lib/snapshot-bridge.ts` |
| AI checkpoints | `git_checkpoint_create/list/restore/delete` | `modules/git/commands.rs` adapters → `operations.rs` | `ai/lib/checkpoint.ts` (create, from edit tools) · `source-control/CheckpointSection.tsx` (list/restore) |
| FS watching | `fs_watch_start`, `fs_watch_stop` + `nexis://fs-changed` event | `modules/fswatch.rs` | `platform/filesystem.ts` → `explorer/FileExplorer.tsx` |
| System monitor | `sysmon_sample`, `sysmon_kill` | `modules/sysmon.rs` | `platform/system-resources.ts` → `sysmon/useSystemMonitor.ts` |
| Editor autosave | `editor_autosave_write/read/delete/sweep` | `modules/autosave.rs` | `editor/lib/autosave-bridge.ts` |
| Crash reports | `list_crash_reports` | `modules/crash.rs` | (settings/diagnostics UI) |
| Diagnostics | `diagnostics_export` | `modules/diagnostics.rs` (hand-rolled store-only zip) | `settings/sections/GeneralSection.tsx` |
| Atlas | `atlas_*` | `modules/atlas/mod.rs` | `atlas/repos/api.ts` — host-scoped; see [[atlas]] |
| Benchmark | `bench_*` | `modules/benchmark/commands.rs` | `benchmark/lib/api.ts` — see [[benchmark]] |
| Command ledger | `ledger_*` | `modules/ledger.rs` | `platform/ledger-storage.ts` → `terminal/lib/ledger.ts` — see [[command-ledger]] |
| AI audit | `ai_audit_append`, `ai_audit_log_path` | `modules/ai_audit.rs` | typed host descriptor in `ai/lib/audit.ts`; settings log reveal remains on the integration queue |
| Tool probing | `tool_probe` | `modules/tools.rs` | `lib/missingTools.ts` |

## Streaming channels

High-volume data uses `tauri::ipc::Channel` passed as a command argument, not global events:

- `pty_open` takes `on_data: Channel<Response>` + `on_exit: Channel<i32>` (`pty/mod.rs`)
- `ai_http_stream` takes `on_event: Channel<AiStreamEvent>` (`net.rs`)

## Global events (`emit`/`listen`)

Frontend-to-frontend cross-window sync includes `nexis://prefs-changed` (see [[settings-sync]]), `nexis://ai-keys-changed`, `nexis://ai-agents-changed`, `nexis://ai-snippets-changed`, `nexis://code-snippets-changed`, `nexis://custom-themes-changed`, `nexis://theme-edit`. Rust→frontend also uses events for `fs:file-written`, `nexis://fs-changed`, LSP/DAP messages, `ml:proto` / `ml:stderr` / `ml:exit`, and `bench://progress` / `bench://result`. ML and Benchmark stream through events today; channels are not a universal streaming boundary. Benchmark listeners outlive the panel.

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
