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

### 8. PTY thread panic propagation via poisoned mutex
**Symptom:** Terminal goes permanently silent (no more output) after an internal panic, with no error shown.

**Root cause:** The reader, flusher, and waiter threads all share a `Mutex<Vec<u8>>` called `pending`. If any thread panics while holding the lock, the mutex becomes poisoned. Any subsequent `.lock().unwrap()` call in another thread also panics, cascading the failure.

**Fix in place:** All `lock().unwrap()` calls on `pending` in `session.rs` now use `.unwrap_or_else(|e| e.into_inner())`, which recovers the data from a poisoned mutex instead of panicking. Same for the `Condvar::wait_timeout(...).unwrap_or_else(...)`.

**Future danger:** Any new code that shares the `pending` Arc and calls `.lock().unwrap()` will re-introduce panic cascading. Always use `unwrap_or_else(|e| e.into_inner())` for shared PTY thread mutexes.

---

### 9. `pty_close` panic on killer mutex poison or thread exhaustion
**Symptom:** Closing a terminal tab crashes the entire app process.

**Root cause (A):** `pty_close` previously called `s.killer.lock().unwrap()` — if the killer mutex was poisoned (child thread panicked while holding it), this panics in the Tauri worker thread, crashing the app.

**Root cause (B):** `thread::Builder::new()...spawn(...).expect("spawn pty drop thread")` panics if the OS refuses to spawn a thread (OOM, thread limit hit).

**Fix in place:** Killer lock now uses `if let Ok(mut k) = s.killer.lock()` (skips kill on poison — harmless, child already dead). Thread spawn now uses `.map_err(...)? ` which returns an error to the frontend instead of panicking.

**Future danger:** Do not add `.unwrap()` or `.expect()` to the drop-thread spawn path. It runs on a Tauri worker thread and any panic there propagates to the runtime.

---

### 10. Shell agent session not retried after open failure
**Symptom:** After an initial `bash_run` tool call fails (e.g. cwd doesn't exist, Rust returns an error), all subsequent `bash_run` calls in the same chat session also fail with the same error, even if the underlying cause is gone.

**Root cause:** `getSessionShell()` in `tools/shell.ts` stores the promise in `sessionShells` even if it rejects. Subsequent calls retrieve the same rejected promise and re-throw without ever retrying `shellSessionOpen`.

**Fix in place:** The promise's `.catch()` handler deletes the `sessionId` entry from `sessionShells` before re-throwing, so the next call starts a fresh open attempt.

**Future danger:** Any code that memoizes Promises must handle rejection — a rejected promise cached in a Map is indistinguishable from a resolved one until awaited.

---

### 11. `approxBytes` panic on circular tool output
**Symptom:** Context compaction throws an unhandled exception mid-conversation, preventing further AI turns.

**Root cause:** `approxBytes` in `compact.ts` called `JSON.stringify(part.output)` directly. If a tool returns an output with circular object references (unusual but possible if a native object is accidentally returned), `JSON.stringify` throws a `TypeError`.

**Fix in place:** `safeJsonLength()` wrapper catches the exception and returns a conservative 256-byte estimate instead of throwing.

**Future danger:** Any place that serializes tool output for estimation must be wrapped defensively. Tool results are untrusted objects.

---

### 12. `dirname()` returns wrong path for Windows drive roots
**Symptom:** `dirname("C:/file.txt")` returns `"C:"` instead of `"C:/"`, causing git operations or path-based navigation to fail on files in drive roots.

**Root cause:** The original `dirname` in `App.tsx` sliced up to the last `/` unconditionally. For `"C:/file"` the last `/` is at index 2, so `.slice(0, 2)` = `"C:"` (missing the trailing slash).

**Fix in place:** Special-case: if `idx === 2` and `normalized[1] === ':'`, return `normalized.slice(0, 3)` to preserve the trailing slash. Also fixed `idx === 0` to return `"/"` (Unix root) instead of the original path.

**Future danger:** Use Node's `path.dirname` equivalent (via `@tauri-apps/api/path`) for any path manipulation that must handle all OS forms. The inline `dirname` helper is only safe for known-well-formed paths.

---

### 13. Git stdout silently discards non-UTF-8 bytes
**Symptom:** Git commands return empty or truncated output when filenames or commit messages contain non-UTF-8 bytes (e.g. Latin-1 encoded commit messages, binary filenames).

**Root cause:** `git_stdout_line_opt` and `git_stdout_lines` in `process.rs` used `std::str::from_utf8(...).unwrap_or("")` — on invalid UTF-8 this returns an empty string, silently discarding all output.

**Fix in place:** Both functions now use `String::from_utf8_lossy(...)` which replaces invalid bytes with `U+FFFD` rather than dropping all output. This matches the behavior already used in `check_git_availability` and `ensure_success`.

**Future danger:** Any new git output parsing that uses `std::str::from_utf8(...).unwrap_or(...)` will silently lose data. Always use `from_utf8_lossy` or explicitly handle the Err case.

---

### 14. Zustand selector returning new array/object → infinite `useSyncExternalStore` loop
**Symptom:** App renders a blank screen. DevTools console shows `The result of getSnapshot should be cached to avoid an infinite loop` followed by `Uncaught Error: Maximum update depth exceeded` with a stack trace pointing into `compose-refs.tsx` (Radix UI internals).

**Root cause:** Zustand uses `useSyncExternalStore` internally. React calls `getSnapshot` (the selector) and compares the result via `Object.is`. If the selector returns a new object or array reference on every call — even with identical contents — `Object.is` fails, React schedules a re-render, the selector runs again, and the loop never terminates. The secondary compose-refs crash is just Radix UI being caught in the re-render storm.

**Fix in place:** `src/modules/statusbar/StatusBar.tsx` had two selectors that called `.filter()` inline:
```tsx
// BAD — .filter() creates a new array on every getSnapshot call
const leftItems = usePluginRegistry((s) => s.statusBarItems.filter((i) => i.side === "left"));
```
Fixed by selecting the stable reference and filtering locally in the render body:
```tsx
// GOOD — selector returns the same reference until the store changes
const statusBarItems = usePluginRegistry((s) => s.statusBarItems);
const leftItems = statusBarItems.filter((i) => i.side === "left");
```

**Future danger:** Any Zustand selector that calls `.filter()`, `.map()`, `.slice()`, object spread `{ ...s.foo }`, or any other expression that creates a new reference on every call will trigger this. The rule: **selectors must return a stable reference** — either a primitive, or the same object/array reference from the store (not a derived one). Use `useShallow` from `zustand/react/shallow` when you genuinely need a derived array/object from the selector.

---

## Pre-push checklist
Before any `git push`, always run these — they mirror the CI gates in `.github/workflows/ci.yml`, so a clean local run means a green CI:
- `pnpm exec tsc --noEmit` — TypeScript must typecheck (CI gates on this; a type error that doesn't break a test still fails CI)
- `pnpm test:coverage` — all Vitest tests must pass **and** coverage must stay above the floor in `vitest.config.ts` (CI runs this, not bare `pnpm test`; dropping below the threshold fails the build). Ratchet the thresholds up as coverage grows; never lower them to get green.
- `cargo test` in `src-tauri/` — all Rust tests must pass (the `authorize_spawn_cwd_blocks_symlink_escape` test fails locally on non-admin Windows with code 1314; that's expected — see Build/dev notes)
- `cargo fmt --check` in `src-tauri/` — formatting must be clean. **Run this last**, after any `clippy` fixes: a clippy change that shortens a signature can leave the file unformatted even though `fmt` ran earlier.
- `cargo clippy -- -D warnings` in `src-tauri/` — zero clippy warnings. Note `src-tauri/clippy.toml` plus `#![warn(clippy::unwrap_used, clippy::expect_used)]` on `net.rs`/`secrets.rs`/`recording.rs` make a new `.unwrap()`/`.expect()` in those modules' production code a CI failure (tests are exempt).

CI also runs `pnpm audit --prod --audit-level high`, which blocks high/critical advisories in the shipped (runtime) dependency tree. Dev-tool advisories don't gate; moderate ones are tracked by the weekly `audit.yml` job. That same `audit.yml` (weekly + on `Cargo.lock`/`deny.toml` change) also runs `cargo deny check` — if you change Rust dependencies, run it in `src-tauri/` locally; a new dependency under a non-allow-listed license or from an unknown source fails it (config + documented exceptions in `src-tauri/deny.toml`). The release workflow additionally enforces a <10 MB binary-size budget.

---

## Build / dev notes
- `cargo check` is fast but does not produce a binary. Run `pnpm tauri dev` to see Rust changes take effect.
- The PS profile at `~/.cache/nexis/shell-integration/powershell/profile.ps1` is written on first terminal open and only updated when the embedded content changes. Kill the running app and delete the file to force a refresh during development.
- Thread names in the PTY subsystem are prefixed `nexis-pty-*` — searchable in logs.
- `authorize_spawn_cwd_blocks_symlink_escape` test in `workspace.rs` requires `SeCreateSymbolicLinkPrivilege` — it will fail on non-admin Windows 10 (`code: 1314`). This is expected; run as admin or on Windows 11+ to validate.
