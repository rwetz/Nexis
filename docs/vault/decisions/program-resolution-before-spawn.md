---
type: decision
description: LSP and DAP resolve a program name to a concrete path via the same PATH walk tool_probe uses, then spawn that path — because Rust's Command ignores PATHEXT on Windows
---

# External programs are resolved to a path before spawning, not handed to `Command` as a bare name

**Date:** 2026-08
**Status:** active

## Context

Nexis asks two different questions about the same external tool, and they were answered by two different pieces of code:

- **"Is it installed?"** — `tool_probe` (`src-tauri/src/modules/tools.rs`), behind the missing-tools pill's refresh button.
- **"Run it."** — `LspSession::start` / `DapSession::start`, which called `proc::command(<bare name>)`.

`tool_probe` walks `PATHEXT` on Windows on purpose: every server from `vscode-langservers-extracted` installs as a `.cmd` shim, not an `.exe`. `std::process::Command` does **not** walk `PATHEXT` — its Windows resolution appends only `.exe`. So `vscode-css-language-server` was simultaneously "installed" (probe) and "not found" (spawn).

The user-visible shape of this was a notice that lied in both directions: refresh cleared the entry, and the next `.css` file put it back, forever.

## Decision

The PATH walk returns the **resolved path**, not a bool. `tools::resolve_on_host(name) -> Option<PathBuf>` is the single implementation; `resolves_on_host` is now `resolve_on_host(..).is_some()`. Both spawn sites resolve first and pass the resulting path to `proc::command`, falling back to the bare name when resolution finds nothing so the failure path and its error message are unchanged.

On Windows the suffix list tries **PATHEXT entries before the extensionless spelling**. npm writes three files per bin — `foo.cmd`, `foo.ps1`, and an extensionless `foo` that is a bash script for MSYS/Git Bash. Preferring the bare spelling resolves to a path `CreateProcessW` cannot execute, which is strictly worse than not resolving at all.

## Alternatives rejected

- **Append `.cmd` on Windows at the call site** — hard-codes one shim flavour, ignores the user's actual `PATHEXT`, and puts platform knowledge in every spawn site instead of one.
- **Spawn through `cmd /c`** — Rust's std already detects `.bat`/`.cmd` by extension and routes them through `cmd.exe` with the hardened quoting added for CVE-2024-24576. Doing it by hand re-opens the quoting hole that fix closed.
- **Teach `proc::command` to resolve** — tempting, but `proc::command` is also used for `wsl.exe`, `git`, `nvidia-smi` and absolute interpreter paths, where a PATH walk is either wasted or actively wrong. Resolution belongs to the callers that take a *user- or config-supplied* program name.

## Consequences

- Probe and spawn can no longer disagree: they are the same walk. A future divergence would require someone to reintroduce a second lookup.
- Any **new** spawn site whose program name comes from config or user input should call `resolve_on_host` first. Sites that spawn a fixed system binary (`wsl.exe`, `git`) or an already-absolute path do not need it.
- This is host-side resolution only. WSL tools resolve inside the distro via `command -v` through `wsl_exec_capture` — see pitfall #20 in CLAUDE.md for why the two sides must not answer for each other.
- The Windows branch is `#[cfg(windows)]`, so CI on Linux does not exercise it. The `windows_tries_pathext_before_the_extensionless_name` test asserts the ordering invariant on every platform by checking the suffix list's shape.
