---
type: map
description: Inventory of Rust backend modules under src-tauri/src/modules/ with one-line purposes.
---

# Rust backend modules (`src-tauri/src/modules/`)

As of 2026-07. One-liners are orientation, not spec — verify in code, and fix here if wrong.

- `pty/` — the heart of the terminal. `session.rs` (session lifecycle, `CONPTY_LIFECYCLE_LOCK`, `MAX_PENDING` 4 MiB buffer), `shell_init.rs` (profile injection, `write_if_changed` cache), `job.rs`, `da_filter.rs`, `scripts/`. Dense with invariants — read [[pty]] and CLAUDE.md pitfalls #1, #6–#9 before touching.
- `proc.rs` — **the only sanctioned way to build a subprocess**: `proc::command()` pre-applies `CREATE_NO_WINDOW`. Raw `Command::new` is banned by clippy + tripwire (CLAUDE.md pitfall #4).
- `workspace.rs` — workspace root authorization (`authorize_spawn_cwd`); gates every user-supplied cwd (pitfall #1C)
- `git/` — git operations; output parsing must use `from_utf8_lossy` (pitfall #13)
- `fs/` — file I/O commands
- `shell/` — one-shot / session shell execution for AI tools
- `lsp/` / `dap/` — language server and debug adapter process management
- `net.rs` / `secrets.rs` / `recording.rs` — network, secret storage, recording; `#![warn(clippy::unwrap_used, clippy::expect_used)]` — no unwrap/expect in production code here
- `http_share.rs` — local HTTP sharing
- `ml.rs` / `python.rs` — ML engine and python probing
- `crash.rs` — crash handling

## Guard rails

- `src-tauri/tests/pitfall_invariants.rs` — tripwire suite enforcing the invariants above; **fix code, never the tripwire**
- `src-tauri/clippy.toml` — `disallowed-methods` bans `std::process::Command::new`
- `src-tauri/deny.toml` — dependency license/source policy (`cargo deny check` when touching deps)
