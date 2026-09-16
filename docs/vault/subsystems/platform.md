---
type: subsystem
description: Frontend platform policy for typed IPC, workspace scope, persistence, processes, files, windows and notifications.
---

# Frontend platform

`src/platform/` is the Nexis-owned boundary between frontend capabilities and Tauri. It owns transport and cross-cutting policy; capability behavior stays outside it. Rust remains authoritative for filesystem authorization, WSL translation, subprocess confinement and PTY lifecycle.

## Key files

- `ipc.ts`, `tauri.ts`, `events.ts` — typed command scope, raw Tauri transport and disposable event lifetimes
- `workspace.ts`, `workspace-state.ts`, `workspaces.ts` — environment/root identity, authorization and the one workspace store
- `storage.ts`, `persistence.ts` — one `LazyStore` handle per file and failure-recovering write queues
- `filesystem.ts`, `process.ts`, `processes.ts` — host/workspace file scope and captured non-PTY session ownership
- `windows.ts`, `notifications.ts` — concurrent named-window coalescing and the shared notification contract
- `ledger-storage.ts`, `system-resources.ts` — host-owned command-ledger and system-monitor adapters
- `src/domain/native-types.ts` — shared IPC result types with no capability ownership

## Invariants / gotchas

- A descriptor chooses host or workspace scope. Callers cannot supply their own `workspace` field; `workspaceIpc` injects a snapshot.
- Capture the workspace environment before an awaited authorization and reuse it for the operation. Otherwise a user switching environments can authorize in one distro and execute in another.
- Host exports such as Benchmark output must use `hostFilesystem`; workspace editing uses `filesystem` and preserves caller-side Linux paths for WSL fallbacks.
- Preference ordering covers the whole set/save/event transaction, not only individual store calls. See [[settings-sync]].
- `createProcessService` is for non-PTY sessions. Rust construction still goes through `modules/proc.rs:command`; terminal PTYs keep their existing path and invariants.
- A named window open is coalesced until native creation succeeds or fails. Failed creation must leave the label retryable.

## Debugging entry points

- Wrong distro or host path in an IPC payload → `workspace-state.ts:ipcForEnvironment` and the command descriptor scope
- Later writes stop after one rejection → `persistence.ts:createWriteQueue`
- Agent shell retries reuse a dead session → `process.ts:createProcessService` and `ai/tools/shell.ts:getSessionShell`
- Duplicate companion windows → `windows.ts:ensureWindow`

## Related

[[architecture-boundaries]] · [[ipc-surface]] · [[settings-sync]] · [[pty]] · [[e2e-harness]]
