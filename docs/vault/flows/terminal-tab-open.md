---
type: flow
description: End-to-end sequence when a terminal tab opens — from tab UI through pty_open to first bytes on screen.
---

# Flow: terminal tab opens

The highest-stakes flow in the app — four distinct root causes for "blank terminal" live along it (CLAUDE.md pitfall #1).

1. **Tab created.** `tabs/lib/useWorkspaceCwd.ts` decides the cwd (inherits from the active tab's shell cwd).
2. **Session hook.** `terminal/lib/useTerminalSession.ts` drives the xterm.js lifecycle and calls `openPty`.
3. **Pre-authorize.** `terminal/lib/pty-bridge.ts:openPty` first invokes `workspace_authorize` on the cwd — required, because `pty_open`'s `authorize_spawn_cwd` check (`workspace.rs`) rejects cwds outside authorized roots (pitfall #1C: this is why `cd`-to-another-drive-then-new-tab used to blank).
4. **Channels wired.** `openPty` creates `Channel<ArrayBuffer>` (data) and `Channel<number>` (exit); on-exit auto-noops both handlers to prevent late writes.
5. **`pty_open`** (`pty/mod.rs` → `session.rs:spawn`): takes `CONPTY_LIFECYCLE_LOCK` (pitfall #1A), builds the shell command via `shell_init.rs` (PowerShell: `-Command` + `NEXIS_PWSH_PROFILE`, never `-File` — #1B; profiles cached via `write_if_changed` — pitfall #6), spawns via `portable_pty`, starts `nexis-pty-*` reader/flusher/waiter threads sharing the `pending` buffer (poison-recovering locks — pitfall #8; 4 MiB `MAX_PENDING` backpressure cap — pitfall #7).
6. **Output flows** through the data Channel → `handlers.onData` → xterm.js write.
7. **Close.** `pty_close` drops the session on a **detached thread** via `session::drop_session` (never inline `drop` — #1A), killer-lock failures tolerated (pitfall #9).

**Failure diagnosis:** any `pty_open` error is logged as `[nexis] openPty failed:` in the devtools console; then follow the 5-step checklist in CLAUDE.md pitfall #1.

## Related

[[pty]] · [[ipc-surface]]
