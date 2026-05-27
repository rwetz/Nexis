# Changelog

All notable changes to Nexis. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (pre-`1.0`, minor bumps may include breaking changes).

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
