# Nexis — project notes for Claude Code

## Architecture in one line
Tauri 2 desktop app: React + xterm.js frontend, Rust backend handling PTY sessions, git, file I/O, and AI tool execution.

---

## Knowledge vault — `docs/vault/`

`docs/vault/` is an Obsidian-compatible knowledge base mapping this codebase (module maps, subsystem guides, flows, decisions, runbooks). **Before working on an unfamiliar subsystem, read `docs/vault/Home.md` and the relevant `subsystems/` note** — it's cheaper than rediscovering structure by grepping. **After non-trivial work, update the touched note**: fix stale claims, add what you had to discover the hard way; create a note from `templates/` if real discovery happened and none exists. Rules in `docs/vault/conventions.md`. The vault is a map, not a record — CHANGELOG.md stays the record of what shipped, and this file stays authoritative for invariants/pitfalls; the vault links to them, never restates them.

---

## CHANGELOG is the record — keep it current (TOP PRIORITY)

`CHANGELOG.md` is the **single source of truth for what shipped**. Maintaining it — detailed, accurate, and up to date — is a top-priority part of every change, not an afterthought.

- **Every user-facing change gets a CHANGELOG entry in the same commit/PR that makes it.** Features, fixes, security changes, perf, and notable behavior changes all count. Shipping a change without documenting it is a defect. (This has bitten us: the entire 1.20.1 visual "spice-up" pass, the new AI providers, and the exit-status gutter shipped in the tagged release with *no* changelog entry — backfilled later from commit diffs. Don't repeat that.)
- **Write from the diff, not from the commit subject.** Name the specifics: the feature, the keybinding, the file/flag, the *why*, and any tradeoff or limitation. Match the depth of the existing entries — a vague one-liner is not acceptable.
- **Keep an `[Unreleased]` section at the top** and add to it as you work; it's renamed to the version on release. Follow the existing `### Added / Fixed / Changed / Security` grouping and the `**bold lead-in** — prose` bullet style.
- **`ROADMAP.md` is NOT a record.** It is a working to-do list — items are added when planned and erased once done; its history is disposable. Never treat ROADMAP as the place to record what shipped, and don't rely on it to reconstruct history. All record-keeping lives in the CHANGELOG.

---

## Known bug pitfalls

**These invariants are enforced by the build, not just this document.** Two tripwire suites scan the source tree and fail with a message naming the pitfall: `src-tauri/tests/pitfall_invariants.rs` (ConPTY lifecycle lock, `-Command` launch, `authorize_spawn_cwd`, `Command::new` confinement, PTY lock-poison handling, heavy-command async audit) and `src/lib/pitfall-guards.test.ts` (`pty_open` confinement, `writePref` routing, composer `disabled`, reasoning pruning, Zustand selector references, CodeMirror zoom exemption). `src-tauri/clippy.toml` additionally bans raw `std::process::Command::new` via `disallowed-methods`. **If one of these fails, fix the code — never weaken or delete the tripwire.** They exist because every guarded invariant has been broken at least once by a refactor that looked harmless.

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

**Fix in place (D):** Every non-PTY subprocess is now constructed via `crate::modules::proc::command()`, which pre-applies `CREATE_NO_WINDOW`. Raw `std::process::Command::new` is banned by `disallowed-methods` in `src-tauri/clippy.toml` (CI runs `clippy -D warnings`) and by the `pitfall_1d_command_new_only_in_proc_rs` tripwire test. See pitfall #4.

**Future danger (D):** Build new subprocesses with `proc::command(program)` — never `Command::new`. PTY sessions go through `portable_pty`, which sets the flag internally; do not route them through `proc::command`.

**Checklist when a blank terminal is reported:**
1. Does it happen after closing another tab? → Root cause A (ConPTY lock)
2. Does it happen only with PowerShell, not cmd? → Root cause B (-Command flag)
3. Does it happen when `cd`-ing outside home/launch dir then opening a new tab? → Root cause C (workspace_authorize)
4. Did a new Rust spawn site bypass `proc::command()` (e.g. with `#[allow(clippy::disallowed_methods)]`)? → Root cause D
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

**Fix in place:** `crate::modules::proc::command(program)` is the only sanctioned constructor for non-PTY subprocesses — it returns a `Command` with `CREATE_NO_WINDOW` already applied. All spawn sites (git, shell one-shots, agent background procs, WSL probes, LSP/DAP servers, ML engine, python probes) build through it. Raw `std::process::Command::new` fails CI twice over: `disallowed-methods` in `src-tauri/clippy.toml`, and the `pitfall_1d_command_new_only_in_proc_rs` test in `src-tauri/tests/pitfall_invariants.rs`.

**Future danger:** Use `proc::command(...)` for any new subprocess. Do not add an `#[allow(clippy::disallowed_methods)]` outside `proc.rs`. PTY sessions go through `portable_pty` which handles the flag internally — do not route them through `proc::command`.

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

**Location:** `src-tauri/src/modules/pty/shell_init.rs` — one shared `write_if_changed` at module level, used by both the `unix` and `windows` submodules. Cached profiles live at `~/.cache/nexis/shell-integration/`.

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

**Future danger:** Never write a new local `dirname`/`basename` helper in a component — seven private copies of the naive form survived long after the canonical fix and carried this exact bug. Import from `src/lib/path.ts` instead: `dirname` (nullable, absolute), `absoluteDirname` (navigation, floors at `/` / `C:/`), `displayDirname` (labels, `""` when no parent), `basename`. Exception: `ai/lib/security.ts` keeps a private basename on purpose (hardened comparison surface — do not "consolidate" it).

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

### 15. CodeMirror under CSS zoom → clicks land on the wrong line
**Symptom:** After changing app zoom (Ctrl+= / Ctrl+-), clicking in the code editor places the cursor on a different line than the one clicked — the offset grows with distance from the top (at zoom 1.4, clicking line 13 lands on ~line 19, i.e. 13 × 1.4). Persists across restarts because `zoomLevel` is saved in preferences.

**Root cause:** App zoom is implemented as CSS `zoom: var(--app-zoom)` on `.zoom-content` (`src/styles/globals.css`). WebKitGTK's caret-from-point APIs, which CodeMirror's `posAtCoords` relies on, do not account for a non-standardized ancestor CSS `zoom`, so mouse coordinates and document geometry disagree by exactly the zoom factor. Same class of problem that made the terminal and REPL `zoom-exempt` from the start — the editor was never exempted.

**Fix in place:** Two halves, both required: `.zoom-content .cm-editor { zoom: calc(1 / var(--app-zoom, 1)) }` in `globals.css` neutralizes the ancestor zoom (net scale 1.0, coordinates trustworthy), and the shared editor theme in `src/modules/editor/lib/extensions.ts` sets `.cm-scroller` `fontSize: calc(13px * var(--app-zoom, 1))` so zooming still visibly scales the code. Covers every CodeMirror instance (EditorPane, GitDiffPane, AiDiffPane) via the `.cm-editor` selector.

**Future danger:** Do not put a CodeMirror editor under a CSS-`zoom`ed ancestor without the exemption, and do not "simplify" the font-size back to a plain `13px` (that silently makes zoom a no-op for the editor). If a new pane renders CodeMirror *outside* `.zoom-content` or inside an already `zoom-exempt` container, the `.zoom-content .cm-editor` rule composes correctly (it only fires under `.zoom-content`) — but check click accuracy at zoom ≠ 1 anyway. Enforced by `pitfall 15` in `src/lib/pitfall-guards.test.ts`.

---

## Pre-push checklist
First, **update `CHANGELOG.md`**: every user-facing change in this push must have an entry under `[Unreleased]` (see "CHANGELOG is the record" above) — this is not optional.

Then run these — they mirror the CI gates in `.github/workflows/ci.yml`, so a clean local run means a green CI:
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
