# Nexis — project notes for Claude Code

## Architecture in one line
Tauri 2 desktop app: React + xterm.js frontend, Rust backend handling PTY sessions, git, file I/O, and AI tool execution.

---

## Known bug pitfalls

### 1. ConPTY lifecycle race (Windows — CRITICAL)
**Symptom:** New terminal opens blank — cursor visible but shell never prints output.

**Root cause (A):** On Windows, `CreatePseudoConsole` and `ClosePseudoConsole` must not run concurrently. An overlapping close corrupts the newly-created console so the child process spawns but never pumps output.

**Fix in place (A):** `CONPTY_LIFECYCLE_LOCK` in `src-tauri/src/modules/pty/session.rs` serializes both operations. `spawn()` holds the lock while creating, and `drop_session()` holds it while dropping (which triggers `ClosePseudoConsole`). `pty_close` calls `session::drop_session(s)` on a detached thread — **never call `drop(s)` directly in `pty_close`**.

**Future danger (A):** If you refactor `pty_close`, `pty_open`, or the session drop path, make sure both the create side (`spawn`) and the close side (`drop_session`) still share `CONPTY_LIFECYCLE_LOCK`. Removing or splitting the lock re-introduces the race. Affected commits: `fix(pty): serialize ConPTY create+close with shared lifecycle lock`.

**Root cause (B):** Launching PowerShell with `-File profile.ps1 -NoExit` starts the shell in script-execution mode and then transitions to interactive. During that transition the ConPTY output stream is not yet fully initialized, so the first prompt is silently dropped.

**Fix in place (B):** `src-tauri/src/modules/pty/shell_init.rs` (Windows `build` fn) now launches PowerShell with `-Command "if ($env:NEXIS_PWSH_PROFILE) { . $env:NEXIS_PWSH_PROFILE }"` and sets `NEXIS_PWSH_PROFILE` as an environment variable. This keeps PowerShell interactive from the very first byte and avoids path-quoting issues.

**Future danger (B):** Do not revert to `-File profile.ps1`. If you need to change the profile launch, keep `-Command` (not `-File`) and keep the path in an env var.

**Root cause (C):** `authorize_spawn_cwd` in `pty_open` (Rust) rejects cwds that are not under an authorized workspace root (home dir or launch dir). When a user `cd`s to a different drive (e.g. `E:\Projects`) and opens a new tab, `inheritedCwdForNewTab()` returns that path. The `pty_open` IPC call fails silently in the JS `.catch()`, leaving a blank terminal with only the cursor visible.

**Fix in place (C):** `src/modules/terminal/lib/pty-bridge.ts` `openPty` now calls `workspace_authorize` on the cwd before calling `pty_open`. This adds the path to the authorized roots so the subsequent `authorize_spawn_cwd` check passes. If the path doesn't exist, `workspace_authorize` fails (swallowed), and `pty_open` will also fail with "cwd not accessible".

**Future danger (C):** If you add another code path that calls `pty_open` with a user-supplied cwd (e.g. from a tab restore, split pane, or deep-link), make sure `workspace_authorize` is called first. Skipping it will silently produce a blank terminal on any path outside `~` or the app launch directory.

**Root cause (D):** Any `Command::new().spawn()` call on Windows that lacks `CREATE_NO_WINDOW` briefly creates a visible console. If a ConPTY session is active at that moment, the console creation races with ConPTY I/O and can corrupt the active pseudoconsole — the shell in the open terminal goes silent even though it is still running.

**Fix in place (D):** `crate::modules::proc::hide_console(&mut cmd)` is now applied to every non-PTY spawn site: `run_git_uncached`, `run_blocking`, `background::spawn`, `run_wsl`, and `wsl_exec_capture`. See pitfall #4 for the full list.

**Future danger (D):** Any new `Command::new().spawn()` that runs while a terminal tab is open and lacks `hide_console` can blank an active terminal. This is silent — the user just sees the prompt disappear. PTY sessions go through `portable_pty` which sets the flag internally; everywhere else you must add it manually.

**Checklist when a blank terminal is reported:**
1. Does it happen after closing another tab? → Root cause A (ConPTY lock)
2. Does it happen only with PowerShell, not cmd? → Root cause B (-Command flag)
3. Does it happen when `cd`-ing outside home/launch dir then opening a new tab? → Root cause C (workspace_authorize)
4. Did you recently add a new `Command::new().spawn()` in Rust? → Root cause D (hide_console)
5. Check the Tauri devtools console for `[nexis] openPty failed:` — this is always logged when pty_open returns an error.

---

### 2. Settings changes not propagating cross-window
**Symptom:** User changes a setting in the Settings window; main window doesn't update until restart.

**Root cause:** The Settings window is a separate Tauri webview. `LazyStore.onChange` only fires within the writing process. Cross-window sync requires emitting a `nexis://prefs-changed` Tauri event via `writePref()`.

**Fix in place:** All setters in `src/modules/settings/store.ts` route through `writePref()`. **Never call `store.set() + store.save()` directly** for a user-facing preference — always use `writePref()` so the event is emitted.

**Future danger:** Adding a new preference setter and forgetting to use `writePref()` silently breaks live sync. The bug is invisible in single-window testing.

---

### 3. Reasoning/thinking blocks in model message history
**Symptom:** Cerebras provider returns an error mid-conversation; other providers silently burn extra tokens.

**Root cause:** Some providers (Cerebras) reject messages that contain reasoning/thinking blocks from a prior turn. Even providers that accept them count them against the compaction budget.

**Fix in place:** `pruneMessages({ reasoning: "all", emptyMessages: "remove" })` is called in `src/modules/ai/lib/agent.ts` before passing history to `compactModelMessagesDetailed`.

**Future danger:** If you add a second agent code path or a subagent runner, make sure it also prunes reasoning before building the message array.

---

### 4. Windows subprocess console flash (also causes blank terminals)
**Symptom:** A black console window briefly flashes on screen whenever Nexis spawns a git command or one-shot shell command. **Secondary symptom:** an active terminal tab goes blank / loses its shell output — the visible flash races with ConPTY I/O and can corrupt the active pseudoconsole (see pitfall #1 root cause D).

**Root cause:** `std::process::Command` on Windows inherits the parent's console by default. GUI apps have no console, so Windows creates a temporary one — visible as a flash, and destructive to any live ConPTY.

**Fix in place:** `crate::modules::proc::hide_console(&mut cmd)` sets `CREATE_NO_WINDOW` before spawning. Applied in:
- `src-tauri/src/modules/git/process.rs` — `run_git_uncached`
- `src-tauri/src/modules/shell/mod.rs` — `run_blocking`
- `src-tauri/src/modules/shell/background.rs` — `spawn` (agent background processes)
- `src-tauri/src/modules/workspace.rs` — `run_wsl` and `wsl_exec_capture` (WSL listing and home-dir probes)

**Future danger:** Any new `Command::new(...).spawn()` call on Windows that is not a PTY session needs `hide_console`. PTY sessions go through `portable_pty` which handles this internally — do not add it there.

---

### 5. Composer textarea disabled while agent streams (Windows focus steal)
**Symptom:** On Windows, when an agent turn starts the keyboard focus jumps away from whatever the user was doing; the input bar is unresponsive until the agent finishes.

**Root cause:** `disabled={c.isBusy}` on the textarea causes React to re-render the element as disabled, which triggers a blur event. On Windows this focus loss is more noticeable than on macOS.

**Fix in place:** `disabled` prop removed from the textarea in `src/modules/ai/components/AiInputBar.tsx`. The submit-on-Enter path in `onKeyDown` already guards against double-submit via `c.isBusy`.

**Future danger:** Do not re-add `disabled={c.isBusy}` to the composer textarea. If you need to visually indicate busy state, use a CSS opacity/cursor change instead.

---

### 6. Shell profile cache not updating after content change
**Symptom:** Profile changes (e.g. renaming internal functions) don't take effect even after rebuilding.

**Root cause:** `write_if_changed` compares the embedded script content against the cached file on disk. If the content is identical the file is not rewritten, so old function names persist until the embedded content actually differs.

**Location:** `src-tauri/src/modules/pty/shell_init.rs` — `write_if_changed` in both the `unix` and `windows` submodules. Cached profiles live at `~/.cache/nexis/shell-integration/`.

**Future danger:** If you need to force a profile refresh during development without changing the script content, delete the cached file manually. Do not bypass `write_if_changed` with a direct write — the atomic rename it performs prevents a parallel shell startup from sourcing a half-written file.

---

### 7. PTY output buffer overflow (4 MiB cap)
**Symptom:** Terminal shows `[nexis: dropped output due to backpressure]` and resets. Part of the output from a long-running command is lost.

**Root cause:** The reader→flusher pending buffer is capped at 4 MiB (`MAX_PENDING` in `session.rs`). If xterm.js falls behind (e.g. hidden pane, slow render), the buffer fills and is discarded rather than letting the cap grow unbounded and OOM the process.

**Not a bug, but know it exists:** The overflow notice is intentional. If a user reports missing output, check `MAX_PENDING`. Raising it trades memory safety for completeness.

---

## Build / dev notes
- `cargo check` is fast but does not produce a binary. Run `pnpm tauri dev` to see Rust changes take effect.
- The PS profile at `~/.cache/nexis/shell-integration/powershell/profile.ps1` is written on first terminal open and only updated when the embedded content changes. Kill the running app and delete the file to force a refresh during development.
- Thread names in the PTY subsystem are prefixed `nexis-pty-*` — searchable in logs.
