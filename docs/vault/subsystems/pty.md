---
type: subsystem
description: PTY subsystem — terminal sessions end to end, from pty-bridge.ts to ConPTY. The model example of a subsystem note.
---

# PTY subsystem

Terminal sessions end to end: frontend xterm.js ↔ Tauri IPC ↔ Rust PTY threads ↔ shell process.

## Key files

- `src/modules/terminal/lib/pty-bridge.ts` — frontend seam; `openPty` **must call `workspace_authorize` before `pty_open`** for any user-supplied cwd
- `src-tauri/src/modules/pty/session.rs` — session lifecycle, reader/flusher/waiter threads, `CONPTY_LIFECYCLE_LOCK`, `MAX_PENDING` (4 MiB backpressure cap)
- `src-tauri/src/modules/pty/shell_init.rs` — shell profile injection; profiles cached at `~/.cache/nexis/shell-integration/` via `write_if_changed`
- Thread names are prefixed `nexis-pty-*` — searchable in logs

## Invariants (authoritative detail in CLAUDE.md pitfalls #1, #6–#9)

- ConPTY create and close are serialized by one shared lock; `pty_close` drops sessions on a detached thread
- PowerShell launches via `-Command` + `NEXIS_PWSH_PROFILE` env var, never `-File`
- Shared PTY mutexes recover from poison with `unwrap_or_else(|e| e.into_inner())` — no bare `.unwrap()`
- No `.unwrap()`/`.expect()` on the drop-thread spawn path

## Debugging entry points

- Blank terminal → follow the 5-step checklist in CLAUDE.md pitfall #1
- Missing output on long commands → backpressure cap, pitfall #7 (intentional)
- Stale shell profile in dev → delete the cached file; don't bypass `write_if_changed` (pitfall #6)

## Related

[[rust-modules]] · [[frontend-modules]]
