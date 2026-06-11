# Roadmap

Where Nexis is heading, what's already in, and what I'm deliberately not building.

This gets updated as things shift. Day-to-day tracking lives in [GitHub Issues](https://github.com/rwetz/Nexis/issues).

---

## The point of Nexis

A terminal that treats AI as a first-class citizen — not a chatbot glued to the side, but something woven into the actual workflow. Fast, small, cross-platform, no cloud lock-in. You bring your own keys or run local models entirely offline.

The non-negotiables: terminal correctness, PTY fidelity, under 10 MB, no telemetry.

## Hard limits (things that won't be built)

- **Not a VS Code replacement.** The goal is a focused terminal-first tool — not a feature-for-feature IDE clone.
- **Not a browser.** The preview pane exists for local dev servers only.
- **Not a document editor.** This is terminal-first.
- **Not a package manager UI.** Use `npm`, `cargo`, `pip` in the terminal like normal.
- **No accounts or telemetry.** Ever.
- **No extension marketplace.** Maybe narrow AI tool bundles someday, but not arbitrary plugins.

## Design principles

1. AI should feel native, not bolted on — agents, autocomplete, and voice are first-class features
2. Keep the binary small. Every dependency earns its place.
3. Terminal correctness comes first. TUI apps, PTY edge cases, true-color — all matter.
4. Same experience on macOS, Linux, Windows, and WSL. No platform gets left behind.
5. Safe by default — path guards, SSRF protection, IPC sandboxing, tool approval flows.

---

## Shipped

### Terminal
- [x] Multi-tab terminal with WebGL rendering
- [x] Native PTY (zsh, bash, pwsh, fish, cmd)
- [x] Split panes
- [x] Shell integration — cwd tracking, prompt markers
- [x] Inline search, link detection, true-color
- [x] Private tabs with AI context redaction
- [x] WSL as a first-class workspace environment
- [x] Shell history search — fuzzy Ctrl+R overlay sourced from shell history, keyboard-navigable; rewritten in 1.1.0 to use Rust-side IPC search (50× less data on open, debounced queries, fish multiline support)
- [x] Tab and layout persistence — terminal tabs (with working directory) and editor tabs restored on relaunch
- [x] Configurable terminal font family, size, letter spacing, and scrollback buffer
- [x] Inline terminal suggestions — history-based suggestions with AI-powered opt-in
- [x] Drag and drop into terminal — files as quoted paths, files as AI context attachments

### Editor
- [x] CodeMirror 6 with broad language support (TS/JS, Rust, Python, HTML/CSS, JSON/JSONC, Markdown, Go, C/C++, Java, C#, PHP, Ruby, SQL dialects, YAML, TOML, Shell/Bash, Dockerfile)
- [x] Inline AI autocomplete — project-aware context, low latency
- [x] AI-proposed edit diffs with per-hunk approval
- [x] Vim mode
- [x] Prebuilt editor themes
- [x] Inline linting and diagnostics — real-time syntax error markers via @codemirror/lint; Lezer-based errors for JS/TS, Python, Rust, Go, JSON, HTML, CSS, Markdown
- [x] Code formatting — per-language formatter integration (Prettier, rustfmt, clang-format, etc.) with config UI
- [x] Run files — execute the current file or project from the editor; output captured in a terminal tab
- [x] Snippets library — user-defined code snippets with tab-stop placeholders, scoped by language
- [x] Find and replace across project — workspace-wide search and replace with regex, preview, and per-file confirmation
- [x] Minimap — optional code minimap for navigating large files
- [x] Breadcrumb navigation — file path and symbol breadcrumbs at the top of the editor pane
- [x] Symbol outline panel — file-level function/class/variable tree in the sidebar
- [x] Code folding improvements — fold by indent, by region comments, and by language constructs
- [x] Word wrap toggle — per-file and global word wrap setting
- [x] Symbol rename (F2) — LSP-powered semantic rename across the project when a language server is available (only true references change), with a word-boundary text find/replace fallback when none is
- [x] Editor split diff view — side-by-side comparison view for reviewing changes

### Language Tooling
- [x] Full LSP support — go-to-definition, hover docs, completion, and diagnostics powered by language servers; Rust proxy handles protocol negotiation and session lifecycle
- [x] DAP debugger — breakpoint gutter, step-through controls (step over/in/out/continue), variable inspector, call stack panel; supports Node.js, Python, and LLDB-based runtimes
- [x] Problems panel — file-grouped error/warning list with filter, status bar indicator, and stale-entry cleanup on file close

### Themes
- [x] Custom themes — create, import, and delete `.nexis-theme` files with live swatch preview
- [x] Built-in presets — Nexis Default, Catppuccin Mocha, Nord, Tokyo Night, Rosé Pine, Gruvbox, Caffeine, Claude, Sage, Tide
- [x] Background images with adjustable opacity and blur controls
- [x] Terminal color palettes built into each theme
- [x] Theme editor — Create/Edit opens the `.nexis-theme` file directly in the code editor

### File Explorer
- [x] Catppuccin / Material icon theme
- [x] Fuzzy search, keyboard navigation, inline rename, context menu
- [x] Quick file open (Cmd+P / Ctrl+P) — fuzzy workspace file picker, respects `.gitignore`
- [x] Live file system sync — explorer and editor update in real time as files change on disk

### Markdown
- [x] Markdown preview tab — right-click any `.md` file in the explorer to open a rendered preview
- [x] Markdown raw/preview toggle — switch between rendered preview and raw source in the same tab; split-pane side-by-side mode as opt-in

### Git & Source Control
- [x] Stage, unstage, commit, branch
- [x] Commit graph and history viewer — redesigned in 0.8.6
- [x] Per-file diffs with syntax highlighting
- [x] AI commit message generation — one-click Conventional Commit subject line from staged diff
- [x] AI PR description generation — draft pull request titles and bodies from branch diff
- [x] Redesigned source control panel and git graph — 0.8.6 visual refresh

### AI
- [x] Multi-provider BYOK — OpenAI, Anthropic, Google, Groq, xAI, Cerebras, DeepSeek, Mistral, OpenRouter, Hugging Face Inference API, and OpenAI-compatible
- [x] Offline models via LM Studio, MLX, and Ollama — no API key required
- [x] Multi-agent and sub-agents
- [x] Voice input — Whisper transcription via OpenAI key; mic-denied and transcription failures surface actionable alerts
- [x] Slash commands and skills
- [x] Project memory and per-project AI system prompt via `NEXIS.md`
- [x] File, shell, search, and plan tools with approval flow
- [x] Workspace file picker
- [x] Auto-compaction for long sessions — stable across long conversations; circular tool output and reasoning blocks handled safely
- [x] Dockable AI panel — resizable bottom panel with full chat history and input; detach to a draggable floating window, snap back by dropping near the bottom edge
- [x] AI context inspector — transparency panel showing exactly what context is being sent to the model
- [x] Better approval flow — project-scoped auto-approve policies, per-tool trust levels
- [x] AI skill bundles — installable packages that add new agent tools and slash commands

### Development Panels
- [x] Integrated build system — trigger builds (cargo, pnpm, make, gradle) from inside the app with live output and errors linked to source lines
- [x] Test runner panel — run and watch test suites (Vitest, cargo test, pytest, JUnit) with pass/fail tree, inline failure markers, and re-run on save
- [x] Unified Activity panel — one sidebar view listing background shell processes and queued AI agent tasks; kill any process and stop any running or queued agent task from a single place (background process manager + agent queue merged in 1.17.0)
- [x] Environment variable panel — view, edit, and persist env vars per workspace
- [x] Database integration — connection manager for SQLite, PostgreSQL, MySQL; schema browser, table viewer, query editor with AI-assisted query generation
- [x] Jupyter notebook support — open, edit, and run `.ipynb` files with kernel management, inline cell output rendering (text, plots, tables), and AI-assisted cell generation

### Web Preview
- [x] Auto-detected local dev server preview
- [x] Image and PDF viewers
- [x] Sandboxed iframe

### Platform & Infrastructure
- [x] macOS, Linux (.deb / .rpm / AppImage), Windows (NSIS)
- [x] WSL support
- [x] AUR package
- [x] Windows Explorer context menu — right-click folders, folder backgrounds, and drives to open in Nexis
- [x] Windows NSIS installer — branded header image, correct app name and executable throughout
- [x] Auto-updater
- [x] OS keychain for API keys
- [x] SSRF and DNS rebinding protection
- [x] Sandboxed AI tool surface
- [x] Windows subprocess console flash suppressed (`CREATE_NO_WINDOW` on all spawned commands)
- [x] ConPTY lifecycle race fixed — create and close serialized to prevent blank-terminal bug on Windows
- [x] PTY reliability — mutex-poison recovery, safe `pty_close` drop path, shell session auto-retry after failed open
- [x] User-visible error feedback — rename, delete, shell history, autostart, file attach, voice, and reveal failures all surface actionable alerts
- [x] SSH — PTY sessions over SSH; auth and known_hosts
- [x] Python environment awareness — auto-detect virtualenvs, conda, and pyproject.toml; active env in status bar with quick-switch picker
- [x] Container-aware environments — detect Docker/devcontainer setups; surface container context in the status bar
- [x] Keybinding editor — visual UI for remapping shortcuts, with import/export
- [x] Command palette — fuzzy-searchable palette for every app action (Ctrl+Shift+P)
- [x] Notifications center — in-app log of agent actions, build results, and background task completions
- [x] Plugin API — stable internal contribution surface (status bar items, panels, commands, typed event bus); Python env and container badges migrated to plugins
- [x] Bundle optimizations — lazy language packs, xterm WebGL chunk, scoped package tree-shaking for @codemirror/* (1.1.0)
- [x] Release tooling — automated CHANGELOG generation, version bumps, and tag flow
- [x] Git stash manager — list, create, apply, pop, and drop stashes from the source control panel; collapsible stash list with message, timestamp, and per-entry actions (1.3.0)
- [x] AI inline explain — select any terminal output or code and click "Explain"; submits an explanation request to the AI mini window instantly, no full panel required (1.3.0)
- [x] Terminal → AI — "Explain" and "Ask Nexis" buttons appear on text selection in the terminal or editor; selection is attached as context and the AI responds in the mini window (1.3.0)
- [x] Workspace switcher — Ctrl+` keyboard picker for recently opened folders with fuzzy search; switching resets the workspace and starts a fresh terminal at the selected directory; recent list persists across restarts (1.4.0)
- [x] Persistent AI chat history — searchable session history popover in the AI panel header; sessions sorted by last updated, filterable by title, with compact timestamps; backed by Tauri store across restarts (1.4.0)
- [x] Git submodule support — collapsible submodule list in the source control panel with status badges (ok / modified / uninitialized / conflict), short SHA, path display, and per-entry init/update actions (1.4.0)
- [x] Terminal session recording — record PTY output to an asciinema v2 `.cast` file with a single toggle button; saved to `~/nexis-recordings/`; useful for demos and bug reports (1.5.0)
- [x] Port forwarding panel — dedicated sidebar panel that detects locally listening TCP ports via `ss`/`lsof`/`netstat`; one-click open-in-preview for web/dev server ports; auto-refreshes every 5 s (1.5.0)
- [x] SSH key manager — collapsible section in the SSH panel listing `~/.ssh/*.pub` keys; generate new Ed25519 key pairs via `ssh-keygen` with optional passphrase; one-click copy public key to clipboard (1.5.0)
- [x] Diffstat in commit view — per-file +/− line counts shown in the git history commit detail view for every changed file; already shipped in the `FileRow` component (1.5.0)
- [x] Streaming build errors → AI — "Fix with AI" button appears in the Build panel when a build fails; sends the compiler output directly to the AI panel as a pre-filled prompt (1.6.0)
- [x] Workspace profiles — named configurations storing a root path, env var overrides, and an optional startup command; saved to localStorage; sidebar panel with full CRUD; activating a profile switches workspace, applies env vars, and optionally runs the startup command (1.6.0)
- [x] Embedded REPL panel — interactive Python, Node.js, Ruby, or shell REPL in the sidebar via a dedicated TerminalPane; Alt+Shift+R sends the active editor or terminal selection directly into the running REPL (1.6.0)
- [x] AI code review — on-demand review of staged or all unstaged diff via a dedicated sidebar panel; shows file/line stats and a scrollable diff preview; "Review with AI" sends the diff as a structured prompt (1.7.0)
- [x] AI-assisted git conflict resolution — conflict files automatically surfaced in the source-control panel; "Resolve with AI" reads the conflicted file and sends a structured three-way resolution prompt including conflict markers and context (1.7.0)
- [x] Background agent queue — sidebar panel for queuing multiple AI prompts to run sequentially; tasks show queued/running/done/failed status with duration; failed tasks can be retried; clear-completed action (1.7.0)
- [x] Semantic / AST-aware search — structural symbol search panel with pattern prefixes (fn: class: hook: import: type: const:) that translate to language-aware regexes fed to the existing grep backend (1.8.0)
- [x] Remote Prompt viewing — local HTTP server (stdlib-only TCP) serves the current AI conversation as a self-contained HTML page accessible from any device on the same LAN; same server also handles terminal snapshots (1.8.0)
- [x] AI refactoring engine — sidebar panel with Extract Function, Inline Variable, Add Types, Simplify, Add Error Handling, and Add Docs operations; Alt+Shift+X captures the active editor selection; prompts the AI with structured refactoring instructions (1.8.0)
- [x] Multi-window — open Nexis in multiple independent windows via Ctrl+Shift+N; each window has its own workspace, tabs, and layout; windows share the OS keychain and theme (1.8.0)
- [x] Live terminal streaming — extend LAN share server with Server-Sent Events; browser page auto-updates every 2 s with current terminal output; `/stream` SSE endpoint for real-time viewing on any device on the same network (1.9.0)
- [x] Prompt templates — reusable named AI prompts stored in localStorage; one-click to send any template to the AI panel; create, edit, and delete from the sidebar; four built-in starter templates (1.9.0)
- [x] File bookmarks — bookmark any file or line with Alt+D; persistent sidebar panel grouped by file; inline label editing; keyboard-navigable; backed by localStorage (1.9.0)
- [x] Workspace notes — markdown scratch-pad per workspace saved to `.nexis/NOTES.md`; auto-saves on keystroke; live preview toggle; accessible from the sidebar (1.10.0)
- [x] Git worktrees — list, add, and remove git worktrees from the source control panel; clicking a worktree switches the workspace; branch creation flag; prune support (1.10.0)
- [x] AI explain commit — "Explain" button in the git history commit detail popover; loads the full diff and sends it to the AI panel with author/SHA context (1.11.0)
- [x] Shell command snippets — sidebar panel for saving and running frequently-used shell commands; one-click sends to the active terminal; `{VAR}` placeholder support; five built-in starters (1.11.0)
- [x] Test coverage + E2E harness — expanded Rust and Vitest unit coverage plus a WebdriverIO end-to-end harness; automated release workflow builds the Windows NSIS/MSI installer on `v*` tag push (1.12.0)
- [x] OSC 0/2 tab titles, cursor preferences, error boundary — terminal programs can set the tab title via escape sequences; configurable cursor style and blink rate; a React error boundary renders a recoverable fallback instead of a blank window on a render crash (1.13.0)
- [x] Debugger sidebar panel + pinnable rail — the DAP debugger gets a dedicated sidebar panel; sidebar-rail items can be pinned; PowerShell tab-title fix (1.13.0)
- [x] Expanded syntax highlighting — CodeMirror language packs for 15 additional languages; per-file header blocks added across the source tree; GitHub issue/PR templates (1.14.0)
- [x] UI polish pass + CI hardening — grouped sidebar overflow menu, consistent shortcut key badges, heavier section headers, settings scroll fade, welcome-screen AI entry point, recording-dot hover affordance, and a named `--brand` accent color (P1–P7 from `UI_IMPROVEMENTS.md`); plus Dependabot, a Rust lint job (`cargo fmt --check` + `clippy -D warnings`), and a weekly `cargo audit` (1.15.0)

---

## Up next

- [ ] **Multiplayer terminal view (full)** — the live terminal view ships over SSE (the server pushes a refresh roughly every 2 s); a WebSocket upgrade would give instant bidirectional push without the ~2 s cadence
- [ ] **Refactoring engine (LSP)** — rename symbols now ships via LSP (`textDocument/rename` → workspace edit, with a text fallback); still to come are **extract function** and **inline variable** across a project, powered by LSP code actions / workspace edits
- [ ] **Richer folder icon set** — the file explorer maps folder names onto the catppuccin Iconify set, which has no dedicated glyph for some ecosystems (`.NET`, JVM, mobile, etc.). Add a secondary Iconify set (e.g. `@iconify-json/vscode-icons`) as a fallback in `iconResolver.ts` so folders fall through to purpose-built icons when catppuccin lacks a match. The current stopgap aliases those names onto loosely-related catppuccin icons (mobile→android, jvm→gradle, devops→workflows, dotnet→lib, …), which is approximate — a proper set would give `.NET`/JVM/mobile their own art

---

## Later

- [ ] **Remote workspace** — browse, edit, and run code on remote machines entirely over SSH; the file explorer and editor work against the remote filesystem via SFTP while the terminal is already there; the goal is a seamless local feel with zero local clones required
- [ ] **Persistent terminal sessions** — PTY sessions survive Nexis restarts; reconnect to a running shell without losing scrollback or process state; native implementation inspired by tmux session persistence but without the terminal multiplexer overhead
- [ ] **Custom AI tool authoring** — write and test new agent tools in TypeScript using the Plugin API; a first-party SDK with type definitions, a local test harness, and one-command installation into a workspace
- [ ] **Selective TS → Rust migration** — profile hot paths (terminal input dispatch, diff rendering, file-tree diffing), identify where a Rust implementation gives a measurable win, migrate incrementally without growing bundle size

---

## Good places to help

If you want to contribute, these are areas where outside help actually moves things:

- **Tests** — PTY edge cases across platforms, AI tool security functions
- **Bundle size** — profile it, find wins, propose specific changes
- **Platform bugs** — niche distros, weird shell configs, WSL edge cases
- **Docs** — better examples, screenshots, non-English sections
- **Themes** — terminal palettes and editor themes that fit the aesthetic
- **Provider support** — only if it adds something the `openai-compatible` path can't cover

See `good-first-issue` and `help-wanted` labels for tracked tasks.

---

## Who decides

Me ([@rwetz](https://github.com/rwetz)). If a PR gets closed and you think it shouldn't have, open a GitHub Discussion or leave a comment — I'm happy to talk through it.
