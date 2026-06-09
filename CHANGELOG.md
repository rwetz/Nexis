# Changelog

All notable changes to Nexis. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (pre-`1.0`, minor bumps may include breaking changes).

## [1.15.8] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **AI tool-safety property/fuzz tests** — `security.test.ts` gains property tests over the path/command guards (`checkReadable`, `checkWritable`, `checkShellCommand`): on 20,000 random/adversarial inputs they never throw and always return a boolean `ok`; `checkWritable` is proven at least as strict as `checkReadable` (writes inherit every read denial); any path or command containing a control byte is always refused; and a file under `.ssh` is blocked regardless of case, path separator, drive prefix, or depth.

## [1.15.7] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **Shell session sentinel anti-spoof fuzz** — `shell/session.rs` gains a 50,000-iteration fuzz test for `strip_cwd_sentinel`, asserting its security guarantee: a working-directory update is extracted only when the exact random per-session sentinel is present, so untrusted command output (laced with foreign/partial sentinels, multibyte text, and control bytes) can never spoof a cwd change or alter the passed-through stdout — and never panics.

## [1.15.6] — 2026-06-09

Robustness + more bug-catching tests.

### Added
- **Git porcelain-v2 parser fuzz + edge tests** — `git/parser.rs` gains a 50,000-iteration fuzz test asserting the parser never panics on malformed, truncated, or non-ASCII `git status --porcelain=v2 -z` output (it consumes attacker-influenced branch names and file paths), plus regression cases for empty input and a rename record whose paired original-path token is missing.

### Changed
- **Workspace registry lock recovery** — `WorkspaceRegistry`'s `roots` and `canonical_cache` mutexes now recover from a poisoned lock (`unwrap_or_else(|e| e.into_inner())`) instead of `.expect()`-panicking, matching the pattern already used in the PTY subsystem. Poisoning can only occur under unwind (dev/test builds — release is `panic = "abort"`), but this stops a panic in one thread from cascading through the security-critical authorization path during development.

## [1.15.5] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **SSRF classifier fuzz + boundary tests** — `net.rs` gains a 1,000,000-iteration property test asserting the safety invariant of the `ip_kind` SSRF guard: an IPv4 in any reserved/internal range (RFC1918, CGNAT, link-local, loopback, broadcast, multicast, benchmarking) is never classified `Public`/fetchable. It cross-checks against std's own range predicates, so it's an independent oracle rather than a restatement of the implementation. Plus off-by-one boundary tests for the `172.16/12` and `100.64/10` ranges.

## [1.15.4] — 2026-06-09

CI and tooling hardening — no runtime changes.

### Changed
- **CI: macOS Rust job** — `cargo test` now also runs on `macos-latest`, the only job that compiles and exercises the apple-native keychain backend and the macOS window-controls path.
- **CI: production supply-chain gate** — the frontend job runs `pnpm audit --prod --audit-level high`, failing the build on a high/critical advisory in the *shipped* (runtime) dependency tree. Dev-tool advisories are excluded; moderate advisories remain tracked by the weekly `audit.yml` job.
- **Docs: pre-push checklist** — `CLAUDE.md` now lists every command CI gates on (`tsc --noEmit`, `cargo fmt --check`, `cargo clippy -- -D warnings`), with a note to run `fmt` last after any clippy fixes (the ordering that bit the 1.15.0 cycle).

## [1.15.3] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **Sandbox prefix-matching tests for the workspace authorization guard** — `workspace.rs` gains a pure (filesystem-free) test module for `WorkspaceRegistry::is_authorized`, the component-prefix check at the heart of the spawn sandbox. Includes a regression test that a sibling sharing only a *string* prefix with an authorized root (e.g. `/ws/project-evil` vs root `/ws/project`) is rejected — the classic sandbox escape a switch from `Path::starts_with` to `str::starts_with` would silently reintroduce — plus a 5,000-iteration fuzz cross-check against an independent component-prefix reference.

## [1.15.2] — 2026-06-09

Reliability hardening — no user-facing UI changes yet.

### Added
- **Crash reporter** — a global panic hook writes a structured report (app version, thread, panic location, message, and backtrace) to `{cache}/nexis/crash/` before the process exits. Because the release profile uses `panic = "abort"`, a panic on any thread previously vanished with no trace; it now leaves a diagnosable report on disk. A new `list_crash_reports` command (capped at 10 reports, 64 KB each) lets the UI surface a "Nexis recovered from a crash" notice on the next launch.

### Fixed
- **`get_launch_dir` no longer panics on a poisoned mutex** — it recovers the inner value via `unwrap_or_else(|e| e.into_inner())` instead, so a poisoned `LaunchDir` lock can't abort the whole app under `panic = "abort"`.

## [1.15.1] — 2026-06-09

CI and test hardening — no user-facing changes.

### Changed
- **CI now typechecks** — the `test-frontend` job runs `tsc --noEmit` before Vitest. A type error that doesn't happen to break a test can no longer pass CI green (the job previously ran only `pnpm test`).

### Added
- **Fuzz-lite property tests for the DA (Device Attributes) filter** — `da_filter.rs` gains a dependency-free 20k-iteration property test asserting the invariants that matter for an untrusted-byte parser: chunk-boundary invariance (splitting the stream anywhere yields identical output and replies), no byte synthesis (`out` is always an in-order subsequence of the input and never longer), and that every emitted reply is exactly one of the two canonical DA answers. Plus regression cases for a trailing ESC and SGR sequences.

## [1.15.0] — 2026-06-08

A focused polish pass — no new features and no breaking changes. Implements P1–P7 from the June 2026 UI critique (`UI_IMPROVEMENTS.md`) plus a Rust lint/format cleanup.

### Added
- **Brand accent color** — new `--brand` / `--brand-foreground` CSS variables (coral `oklch(0.72 0.15 35)`) defined in `globals.css` and wired into the Tailwind theme. Applied to the welcome-screen CTA button and the zoom-slider range track so the accent is consistent instead of hardcoded per component.
- **Welcome screen AI entry point** — the shortcut grid's first action is now **Open AI agent** (`Ctrl+I`) instead of a duplicate "New terminal", and the subtitle surfaces the AI agent in one line.

### Changed
- **Sidebar overflow menu** — the overflow popover is restructured into five named, labeled groups (Navigation / Code / AI / Dev Tools / Advanced), replacing the flat 20-item PINNED / MORE split. Pin/unpin toggles and top-to-bottom keyboard navigation are preserved.
- **Shortcuts modal key badges** — every key token now renders as a pill badge, including punctuation (`,` `` ` `` `]`). "Jump to tab 1–9" reads as two distinct badges with a dash separator rather than one elongated pill.
- **Section header weight** — settings and shortcuts-modal section headers upgraded to `text-xs font-semibold text-foreground/70`, making them clearly distinct from body copy.
- **Settings modal scroll affordance** — a bottom fade overlay appears when the active tab's content overflows and disappears once scrolled to the bottom, making the cut-off Terminal section discoverable.
- **Terminal recording dot** — the recording toggle gains a `hover:bg-muted` boundary so it reads as a clickable target in its resting state.

### Fixed
- **Undo/redo in the shortcuts list** — `editor.undo` and `editor.redo` are marked `displayOnly` (they are handled by CodeMirror's history keymap and cannot be remapped via the global shortcut system), matching their code comment.
- **Settings scroll fade on reopen** — the scroll-reset effect now keys off the dialog open state, so reopening on the same tab clears the stale "scrolled to bottom" flag and the fade shows correctly.
- **Welcome-screen CTA hover** — brand button hover opacity normalized to `/80` to match the default button variant.

### Internal
- **CI** — added Dependabot, a Rust lint job (`cargo fmt --check` + `cargo clippy -D warnings`), and a weekly `cargo audit`.
- **Rust cleanup** — applied `cargo fmt` across all source files and resolved every `clippy -D warnings` violation (a `PendingMap` type alias for the DAP/LSP pending-request maps, `next_back()` over `.last()`, and a stray doc comment).

## [1.2.0] — 2026-05-30

### Added
- **Image viewer** — open PNG, JPG, GIF, WebP, SVG, BMP, ICO, AVIF, and TIFF files directly in a new tab. Supports fit-to-window mode, zoom in/out (scroll wheel or toolbar), pixel-perfect rendering at high zoom, fullscreen toggle, and animated GIF/WebP playback pause during window resize or when the tab is hidden.
- **Tab drag-to-reorder** — drag any tab left or right to reorder the tab strip. Chrome-style live preview: the tab slides to its new position in real-time as you drag. Grab cursor on hover, grabbing cursor during drag.
- **Custom cursor set (Tailless Smooth)** — app-wide custom cursors using the Tailless Smooth set. All 29 cursor states are covered (arrow, pointer, text, resize handles, grab/grabbing, crosshair, wait, not-allowed, zoom, and more). Hotspot coordinates read directly from the original `.cur` file headers.
- **Source Control panel icon** — replaced the animated folder in the "No repository" empty state with a static `FolderGitTwo` icon for a cleaner look.

### Changed
- **Welcome screen** — replaced the animated folder with the Nexis logo PNG backed by a theme-colored radial glow. DarkVeil background tuned (speed `0.4 → 0.3`, noise `0.025 → 0.04`). Added a gradient horizontal rule between the CTA and shortcuts grid. `<kbd>` chips now have an inset bevel shadow for a keycap feel.
- **Tab bar** — active tab now shows a 1.5 px primary-color accent line along the top edge.
- **Sidebar rail** — active view indicator changed from a bottom underline to a left-edge 2 px line (matching VS Code / Fleet style).
- **Panel headers** — subtle `primary/4%` gradient sweep on the header row of Recent Files, Snippets, Database, and Source Control panels.
- **Status bar** — hard `border-t` replaced with a soft gradient line that fades at the edges.
- **Scrollbars** — added `.nexis-scrollbar` utility (3 px, semi-transparent thumb) applied to sidebar panel list containers.
- **Empty states** — Snippets panel now shows a `FileCode` icon above the "No snippets yet" text; Database panel icon normalized to size 28 / `30%` opacity to match Source Control and Snippets.

### Fixed
- **Tab reorder via HTML5 drag API** — replaced with mouse-event-based drag (pointerdown → global mousemove/mouseup) to avoid conflicts with Tauri's `data-tauri-drag-region` intercepting drag events on the tab bar container.

---

## [1.1.0] — 2026-05-29

### Added
- **Recent Files panel** — new **Recent Files** entry in the sidebar rail (clock icon, second position after Files). Tracks every file you open through the explorer or that the AI agent writes/edits, persisted across sessions via localStorage (up to 50 entries). Displays filename, directory path, and a relative timestamp ("just now", "3m ago", "2d ago"). Hover any row to reveal a remove button; **Clear** in the panel header wipes the whole list.
- **Fuzzy search on Recent Files** — a filter input appears in the panel whenever the list is non-empty. Matches against the filename (higher weight) and directory path simultaneously, ranks results by consecutive-character runs and proximity to the start of the name, and highlights matching characters inline. Keyboard-navigable: `↓ / ↑` moves the selection, `Enter` opens the file, `Escape` clears the query. Mouse hover and keyboard selection stay in sync.
- **AI-edit tracking in Recent Files** — files written by the AI agent via `edit`, `write_file`, and `multi_edit` tools are automatically pushed to the Recent Files list via the `fs:file-written` event, without any manual action needed.
- **AI mini-window input bar** — the floating AI popup now contains a full text input bar (same `AiInputBar` component as the docked panel). Typing in the mini-window works identically to the main panel; picking a quick-action suggestion pre-fills the input instead of jumping away to the full panel.
- **AI mini-window logo** — Nexis logo displayed at the top of the mini-window popup.

### Fixed
- **App reset to welcome page after AI file edits** — when the AI agent wrote a file and the only open tab was a transient `ai-diff` or `git-diff` tab, `saveTabState` serialized an empty tab list and overwrote the previously-saved terminal/editor tabs in localStorage. On next reload the app found no tabs and showed the welcome page. Fixed by skipping the save when the serialized list would be empty but in-memory tabs still exist.

---

## [1.0.0] — 2026-05-27

This is the first stable release of Nexis. The milestone closes out the initial feature roadmap with release tooling and represents the full pre-1.0 feature set built across the 0.x series.

### Added
- **Release tooling panel** — a dedicated **Release** panel in the sidebar surfaces everything needed to ship: current version from `package.json`, the last git tag, all commits since that tag formatted as a conventional changelog entry, one-click copy to clipboard, and buttons to create a git tag for patch/minor/major bumps directly from the UI.
- **AI skill bundles** — the agent skill system is now extensible. Skill bundles are composable packages of slash commands and agent tools; the foundation for community-installable bundles is in place.

### What's in 1.0

Over the 0.x series, Nexis shipped: multi-tab PTY terminal, CodeMirror 6 editor with AI autocomplete, AI agent panel with 12+ providers (including offline via LM Studio/MLX/Ollama and Hugging Face hosted models), source control, git history, test runner, build system, database panel, SSH connection manager, Jupyter notebook viewer, Python environment awareness, Docker/devcontainer detection, workspace-wide symbol rename, code minimap, snippet library, find-and-replace, command palette, symbol outline, breadcrumb navigation, background process manager, keybinding editor, markdown preview, code formatter, run-file integration, drag-to-float AI panel, notifications center, and more.

No accounts. No telemetry. BYOK or fully offline.

---

## [0.9.15] — 2026-05-27

### Added
- **Jupyter notebook viewer** — right-click any `.ipynb` file in the explorer and select **Open Notebook** to view it in a dedicated tab. Code cells render with syntax-aware styling and execution count labels; markdown cells render as formatted text; stream and error outputs are shown below each code cell with ANSI escape stripping. Static read-only view (no kernel required).

---

## [0.9.14] — 2026-05-27

### Added
- **Container-aware environments** — Nexis now detects Docker and devcontainer configurations in the workspace root (`.devcontainer/devcontainer.json`, `docker-compose.yml`, `Dockerfile`, etc.) and surfaces a **Container** pill in the status bar. The pill shows the detected type (Dev Container, Docker Compose, or Dockerfile) with a tooltip. Detection is automatic and re-runs when the workspace changes.

---

## [0.9.13] — 2026-05-27

### Added
- **SSH connection manager** — a dedicated SSH panel in the sidebar lets you save, edit, and delete SSH connections (host, port, user, identity file). Click **Connect** on any saved connection to open it in a new terminal tab with the correct `ssh` command pre-entered and executed. Connections persist across sessions via the Tauri store.
- **Code minimap** — the editor now shows a 52 px minimap panel alongside the code. Each line is rendered as a thin strip colored by content type (comments vs. code). Click or drag anywhere on the minimap to jump to that position; a viewport indicator shows your current scroll location.

---

## [0.9.12] — 2026-05-27

### Added
- **Workspace-wide symbol rename** — press **F2** on any identifier in the editor to rename it across all files in the workspace. A dialog shows the symbol, a count of occurrences by file, and an input for the new name. Pressing Enter or clicking Rename applies word-boundary-aware replacement to every matching file simultaneously and reloads the editor. Supports any text file; uses the same fast native grep engine as the AI tools.

---

## [0.9.11] — 2026-05-27

### Added
- **Hugging Face integration** — Hugging Face is now a first-class AI provider. Add your HF access token in Settings → AI and choose from five pre-configured hosted models: Llama 3.1 70B, Llama 3.1 8B, Qwen 2.5 Coder 32B, Phi-4, and Mistral 7B. All models run through the HF Inference API and work in the AI panel, autocomplete, and any other model-using feature.

---

## [0.9.10] — 2026-05-27

### Added
- **Integrated build system** — new **Build** tab in the sidebar. Auto-detects your build tool from the workspace root (pnpm, Cargo, Make, Gradle, Maven, CMake, Go, Python). Enter any custom command or use the detected one. Click **Build** (or press Enter) to run; live output streams into the panel. Stop the build at any time. Success/failure status is parsed from the output and shown with a summary line.

---

## [0.9.9] — 2026-05-27

### Added
- **Database panel** — new **Database** tab in the sidebar. Connect to SQLite, PostgreSQL, and MySQL databases. Browse tables with the schema browser; click a table chip to instantly run a `SELECT * … LIMIT 100` query. Write and run arbitrary SQL in the built-in query editor (Ctrl+Enter to run). Results render in a scrollable table with a sticky header. Connections persist across sessions.

---

## [0.9.8] — 2026-05-27

### Added
- **Live file system sync** — the file explorer now auto-refreshes every 3 seconds when the app is focused and the window is visible. Files created, renamed, or deleted by terminal commands or external tools appear immediately without requiring a manual refresh click.
- **Test runner panel** — new **Tests** tab in the sidebar. Auto-detects the test framework from your workspace (Vitest, Jest, Cargo Test, pytest, Go Test, Gradle). Run tests with one click; live output streams into the panel as the suite runs. Stop the run at any time. Test results show pass/fail status with a summary line parsed from the test output.

---

## [0.9.7] — 2026-05-27

### Added
- **AI PR description generation** — **Generate PR Description** button in the Source Control panel opens a dialog that reads the last 20 commits and uses AI to draft a pull request title and Markdown body. The title and body are independently editable before copying. Powered by the same model selected for the AI panel.

---

## [0.9.6] — 2026-05-27

### Added
- **Snippets library** — new **Snippets** tab in the sidebar rail. Create, edit, and delete code snippets with tab-stop placeholders (`$1`, `$2`, …, `$0` for final cursor position), scoped by language. Built-in starter snippets for TypeScript, Python, Rust, and Go. Trigger any snippet in the editor by typing its prefix then pressing **Tab** — the prefix is replaced with the snippet body and the cursor is placed at the first tab stop. Snippets persist across sessions via a local store.

---

## [0.9.5] — 2026-05-27

### Added
- **Breadcrumb navigation** — the editor toolbar now shows the file's path relative to the workspace root as a row of clickable segments. Clicking any folder segment switches the sidebar to the file explorer. The final segment (filename) is styled differently and non-interactive.
- **Symbol outline panel** — new **Outline** tab in the sidebar rail shows a live, scrollable tree of symbols in the active file: functions, classes, interfaces, types, enums, and methods. Symbols are extracted via language-aware regex patterns covering TypeScript/JavaScript, Python, Rust, and Go. Each entry shows the symbol kind (with a color-coded icon), name, and line number.

---

## [0.9.4] — 2026-05-27

### Added
- **Command palette** — `Ctrl+Shift+P` (`Cmd+Shift+P`) opens a fuzzy-searchable overlay of every app action: open settings, toggle panels, new tab, split panes, change sidebar view, toggle the AI panel, zoom controls, and more. Built on `cmdk` for instant keyboard-driven filtering. Commands are grouped by category and navigable with arrow keys; Enter executes, Escape dismisses.

---

## [0.9.3] — 2026-05-27

### Added
- **Find & replace across project** — `Ctrl+Shift+H` (`Cmd+Shift+H`) opens a workspace search overlay. Supports plain text and regex search, case sensitivity toggle, and per-file match preview with syntax-highlighted match regions. **Replace all** reads every matching file, applies the replacement, and writes it back — with a confirmation count on completion. Results show file name, relative path, and each match line with its line number. Shortcut also appears in the keyboard shortcuts dialog.

---

## [0.9.2] — 2026-05-27

### Added
- **Background process manager** — new **Processes** panel in the sidebar shows every `bash_background` process with its command, working directory, start time, and live status (running / exited + exit code). Kill any running process with one click. Badge on the rail shows the count of running processes at a glance.
- **Notifications center** — bell icon in the status bar tracks in-app events (AI completions, errors, background process events). Unread count badge clears on open; individual notifications can be dismissed or bulk-cleared.

---

## [0.9.1] — 2026-05-27

### Added
- **Word wrap toggle** — wrap long lines at the viewport edge instead of scrolling horizontally. Toggle with the **Wrap** button in the editor toolbar or set it permanently in Settings → General → Editor. Persisted across sessions and synced across windows.
- **Code folding improvements** — fold all regions in the active file with `Ctrl+K Ctrl+0` (`Cmd+K Cmd+0` on macOS); unfold all with `Ctrl+K Ctrl+J`. Region comment folding now collapses `// #region` … `// #endregion` blocks (VS Code–compatible syntax) without any extra toolchain.

---

## [0.8.3] — 2026-05-25

### Added
- **Code formatting** — per-language formatter integration triggered from the editor (`Shift+Alt+F`) or automatically on save. Supports Prettier (JS/TS/CSS/HTML/JSON/Markdown), rustfmt, clang-format (C/C++), black (Python), and gofmt (Go). All commands use a `{file}` placeholder and run in the file's directory.
- **Settings → Formatters tab** — enable/disable per language, edit the formatter command, and reset to default. "Format on save" toggle applies the configured formatter after every Ctrl+S save.

### Changed
- **Settings is now an in-app modal dialog** — replaces the separate OS window. Opens centered over the app with a blurred backdrop at 920 × 700 px. Closes on Escape or ×. All existing shortcuts and `openSettingsWindow("tab")` deep-links continue to work.

---

## [0.8.1] — 2026-05-24

### Fixed
- **Terminal keyboard input on fresh launch** — typing in a new terminal tab immediately after launch was silently dropped until the PTY IPC channel was fully ready. Writes are now queued and flushed once the session is open.

---

## [0.8.0] — 2026-05-24

### Added
- **Inline linting and diagnostics** — real-time syntax error markers in the editor gutter via `@codemirror/lint`. Lezer parser errors surface for JS/TS, Python, Rust, Go, JSON, HTML, CSS, and Markdown with zero external toolchain required.

---

## [0.7.6] — 2026-05-24

### Fixed
- **Explorer rename failure is now visible** — `fs_rename` errors were silently swallowed; the user now sees an alert describing what went wrong instead of the rename silently reverting.
- **Explorer delete failure is now visible** — `fs_delete` errors were silently swallowed; the user now sees an alert instead of the file appearing to still exist.
- **Shell history overlay load error** — `read_shell_history` failures were silently caught and left the overlay showing "No shell history found" with no indication of the real problem. The overlay now shows "Could not load shell history" when the invoke fails.
- **Autostart toggle failure is now visible** — enabling/disabling launch-at-login could fail silently (e.g. missing OS permission); the user now sees an alert explaining the failure instead of the toggle appearing to have worked.
- **File attach skips binary/oversized files visibly** — attaching a binary or oversized file to an AI message silently discarded it; the user now sees an alert naming the file and the reason it was skipped.
- **Whisper mic/transcription errors surfaced** — microphone access denial and Whisper API failures were only logged to the console; the user now sees an actionable alert ("Microphone access denied — allow access in system settings" / "Transcription failed — check your OpenAI key and try again").
- **Reveal in file manager failure is now visible** — `revealItemInDir` failures were silently logged; the user now sees an alert when the OS can't reveal the file.

## [0.7.5] — 2026-05-23

### Fixed
- **Installer context-menu entries** — Windows right-click "Open in …" registry entries (for folders, folder backgrounds, and drives) still referenced the old "Terax" app name and executable. Updated `installer-hooks.nsh` to write and clean up `OpenInNexis` keys pointing to `nexis.exe`.

## [0.7.4] — 2026-05-23

### Fixed

**Rust backend**
- **PTY thread panic propagation** — All `.lock().unwrap()` calls on the shared `pending` mutex in `session.rs` (reader, flusher, waiter threads) now use `.unwrap_or_else(|e| e.into_inner())`. A panic in one thread no longer poisons the mutex and silently kills output in all other threads.
- **`pty_close` killer-lock panic** — `s.killer.lock().unwrap()` in `pty_close` replaced with `if let Ok(mut k) = s.killer.lock()`. A poisoned killer mutex (child process had already crashed) no longer panics the Tauri worker thread.
- **`pty_close` thread-spawn panic** — `thread::spawn(...).expect("spawn pty drop thread")` replaced with `.map_err(...)? `. Out-of-memory or thread-limit conditions now return an error to the frontend instead of aborting the process.
- **Git stdout silent UTF-8 data loss** — `git_stdout_line_opt` and `git_stdout_lines` in `process.rs` used `std::str::from_utf8(&output.stdout).unwrap_or("")`, which discards all output on invalid UTF-8 (e.g. Latin-1 encoded commit messages, binary filenames). Changed to `String::from_utf8_lossy(...)` to replace invalid bytes with `U+FFFD` instead of returning empty results.

**TypeScript / Frontend**
- **Shell agent session permanently broken after open failure** — `getSessionShell()` in `tools/shell.ts` cached rejected promises in `sessionShells`. If `shellSessionOpen` failed, every subsequent `bash_run` in that session re-threw the original error forever. The promise's `.catch()` handler now deletes the map entry before re-throwing, so the next call retries cleanly.
- **`approxBytes` throws on circular tool output** — `JSON.stringify(part.output)` in `compact.ts` throws a `TypeError` on circular object references. Replaced with a `safeJsonLength()` wrapper that catches the exception and returns a conservative estimate, preventing context compaction from crashing mid-conversation.
- **`dirname()` wrong result for Windows drive roots** — `dirname("C:/file.txt")` returned `"C:"` instead of `"C:/"`, breaking any path-based git or navigation operation for files at the drive root. Fixed by special-casing `idx === 2 && path[1] === ':'` to preserve the trailing slash. Also fixed `idx === 0` to return `"/"` (Unix root) instead of the full path.

## [0.7.3] — 2026-05-22

### Added
- **Theme editor** — Create/Edit buttons in Settings → Themes now open the `.nexis-theme` file in the code editor. Create generates a starter theme, saves it to custom themes, and opens it for editing. Edit opens the existing file. Main-window listener for `nexis://theme-edit` wired up in `App.tsx`.
- **Installer logo** — Nexis logo added as the Windows installer header image.

### Fixed
- Theme editor Create/Edit buttons were visually present but did nothing — the `nexis://theme-edit` event had no listener in the main window.

## [0.7.2] — 2026-05-22

### Added
- **Custom themes** — create, import, and delete `.nexis-theme` files from Settings → Themes. Swatch grid with live color previews.
- **Background images** — set a custom background image with adjustable opacity (0–100%) and blur (0–64px) in Settings → Themes. Stored locally; no cloud dependency.
- **Theme system foundation** — modular architecture: `types`, `validateTheme`, `themeFiles`, `customThemes`, `applyTheme`, `bgImageStore`, `SurfaceLayer`. Cross-window theme-change sync via `nexis://prefs-changed`.
- **Background preference store** — `backgroundKind`, `backgroundImageId`, `backgroundOpacity`, `backgroundBlur` added to preferences with full cross-window propagation.

### Changed
- Terminal renderer pool and `TerminalPane` updates.
- Settings layout and section polish (Agents, General, Themes sections).
- Style token and global CSS improvements.
- Workspace module updated in Rust backend.

## [0.7.1] — 2026-05-22

### Added
- **Shell history search** — Ctrl+R now opens a fuzzy, keyboard-navigable overlay sourced from your shell history (`~/.zsh_history`, `~/.bash_history`, fish history, PowerShell history). Arrow keys to navigate, Enter to insert, Escape to dismiss.
- **Terminal color themes** — built-in ANSI palette switcher in Settings → General: Default Dark, Catppuccin Mocha, Dracula, Nord, Solarized Dark, One Dark. Swaps hot without restart.
- **Tab and layout persistence** — terminal tabs (with working directory) and editor tabs are saved on change and restored on next launch. Toggle in Settings → General → Startup. Off by default clears saved state immediately.
- **Quick file open (Cmd+P / Ctrl+P)** — fuzzy workspace file picker. Respects `.gitignore`. Opens selected file in a new editor tab.

### Fixed
- Settings window 1px DWM border on Windows 10 removed (matching the main window fix).
- Replaced Terax logo with the Nexis logo in About section.

## [0.7.0] — 2026

### Changed
- Rebranded from Terax to Nexis.
- New Nexis logo across all platforms.
- Updated all branding, storage keys, and event namespaces.

## [0.5.9] — 2026

### Added
- Window management for Linux.

### Changed
- Secrets (keyring) redesign.
- Auto updater stabilization.

## [0.5.8] — 2026

### Added
- Auto-updater wired into release builds.
- GitHub Actions workflow for cross-platform builds and releases.

### Fixed
- Linux window initialization issue on first launch.

### Changed
- CI: bumped Node and pnpm versions used in release pipeline.

## [0.5.7]

### Changed
- Default working directory for new sessions is now `$HOME`.
- Stabilized shell init scripts (zsh / bash / pwsh) — fewer edge cases on first prompt.

## [0.5.6]

### Changed
- Reduced app size and startup cost via lazy loading of editor/AI modules.

## [0.5.5]

### Added
- Demo assets and updated README screenshots.

### Changed
- Dependency version sweep.

## [0.5.4]

### Changed
- Combined snippets and commands into a single surface for a cleaner UX.

## [0.5.3]

### Changed
- UI polish across AI / agent views.

## [0.5.2]

### Changed
- AI mini-window UI/UX improvements.

## [0.5.1]

### Added
- Full agentic workflow: plans, sub-agents, tasks, project init.
- Improved shell tool for the agent.

## [0.4.7]

### Added
- Vim mode in the code editor.
- Keyboard navigation across the file explorer.

## [0.4.6]

### Changed
- Cleanup pass: dependencies, UI, icon set.

## [0.4.5]

### Changed
- Optimized PTY resizing, session lifecycle, and AI context handling.

## [0.4.4]

### Changed
- Agents UI/UX improvements.

## [0.4.3]

### Added
- Skills and multi-agent support.
- Settings UI improvements.

## [0.4.2]

### Changed
- AI autocomplete improvements (latency, accuracy).

## [0.4.1]

### Added
- Local LLM support via LM Studio.
- Groq and Cerebras providers.
- AI autocomplete in the code editor.

## [0.3.9]

### Added
- AI edit diffs — preview and approve agent edits before applying.

## [0.3.8]

### Added
- File search across the workspace.
- Separate editor tab type, decoupled from terminal tabs.

## [0.3.7]

### Added
- Web preview tab with auto-detection of local dev servers.

## [0.3.6]

### Added
- Autostart and window-state persistence.

### Changed
- Settings UI improvements.

## [0.3.5]

### Added
- Standalone settings window.

## [0.3.4]

### Added
- New AI mini-window.
- Text selection handling and session persistence.

## [0.3.1]

### Changed
- Internal refactor.

## [0.3.0]

### Added
- AI agents (initial implementation).
- Apache-2.0 license.

## [0.2.9]

### Added
- Tauri keyring integration — API keys now stored in the OS keychain.

### Changed
- Internal renaming pass.

## [0.2.8]

### Changed
- Icon set and theme refresh.

## [0.2.7]

### Added
- Context menu in the file explorer.

### Changed
- General refactor; editor improvements.

## [0.2.4]

### Fixed
- Various bug fixes.

## [0.2.3]

### Added
- File explorer (first version).
- Code editor based on CodeMirror 6.

## [0.2.1]

### Added
- Logging.

### Fixed
- Shell script handling and session edge cases.

## [0.2.0]

### Added
- AI side panel.
- Status bar.
- Keyboard shortcuts.

## [0.1.3]

### Added
- AI SDK and AI Elements integration.

## [0.1.2]

### Added
- New app logo.
- Configurable window size.

## [0.1.1]

### Changed
- Rendering and resize improvements.
- Header and tabs UI polish.

## [0.1.0]

### Changed
- New UI shell.
- Internal refactor; fixed render/resize race.

## [0.0.8]

### Added
- Multi-tab support.
- Basic layout UI.

## [0.0.7]

### Changed
- Switched icon library from Lucide to HugeIcons.

## [0.0.6]

### Added
- Custom font and theme.
- Tauri window management.

## [0.0.5]

### Added
- xterm.js WebGL renderer, search, and link plugins.

## [0.0.4]

### Added
- shadcn/ui component set and supporting deps.

## [0.0.3]

### Added
- Child process lifecycle handling.
- Per-session locking.

## [0.0.2]

### Added
- Initial Rust PTY backend with xterm.js in React (prototype).
