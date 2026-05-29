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
- [x] AI-powered rename — rename a symbol across the project with AI verification (F2)
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
- [x] Background process manager — visibility into shell background jobs and dev servers running in Nexis
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

---

## Up next

- [ ] **Git stash manager** — list, apply, pop, drop, and create stashes from the source control panel; surface stashable hunks in the diff picker so you can stash partial changes without touching the CLI
- [ ] **Persistent AI chat history** — save and restore chat sessions per workspace across app restarts; a scrollable conversation history list in the AI panel with search; useful for revisiting long agent runs
- [ ] **Terminal session recording** — record PTY output to an asciinema-compatible `.cast` file with a single toggle; replay locally with speed controls; useful for demos and bug reports
- [ ] **SSH key manager** — generate, import, and manage SSH keys within Nexis; tie keys to saved connection profiles in the SSH session panel; no external tool required
- [ ] **Workspace switcher** — fast keyboard-driven picker for recently opened folders (Ctrl+` or similar) with fuzzy search and pin support; restores the tab layout from the last visit
- [ ] **AI inline explain** — select any terminal output or code block and press a keybind to get a concise AI explanation in a popup tooltip, without opening the full chat panel; dismisses on click-away
- [ ] **Terminal → AI** — one-click button in the terminal to send selected lines (or the entire last command's output) as a message into the AI chat; quoted with the originating command for context
- [ ] **Multi-window** — open Nexis in multiple independent windows, each with their own workspace, tabs, and layout; windows share the OS keychain and theme
- [ ] **Git submodule support** — show submodule directories in the file explorer with status badges (initialized, dirty, ahead/behind); init, update, and deinit from the source control panel without leaving the app
- [ ] **Diffstat in commit view** — per-file +/− line counts in the git history commit detail view; click a file row to jump directly to its diff; makes large commits navigable at a glance
- [ ] **Refactoring engine** — rename symbols, extract functions, and inline variables across a project, powered by LSP workspace edits plus an optional AI verification pass; now realistic since LSP landed in 1.1.0
- [ ] **Port forwarding panel** — surface forwarded ports from SSH sessions and dev servers in a dedicated panel with one-click open-in-preview; pairs with the background process manager

---

## Later

- [ ] **Remote workspace** — browse, edit, and run code on remote machines entirely over SSH; the file explorer and editor work against the remote filesystem via SFTP while the terminal is already there; the goal is a seamless local feel with zero local clones required
- [ ] **Persistent terminal sessions** — PTY sessions survive Nexis restarts; reconnect to a running shell without losing scrollback or process state; native implementation inspired by tmux session persistence but without the terminal multiplexer overhead
- [ ] **Background agent queue** — queue multiple AI tasks to run sequentially or in parallel with a dedicated dashboard showing live progress, logs, pause, and cancel controls; agents share workspace context and can hand off results to each other
- [ ] **Workspace profiles** — named configurations bundling a shell, env vars, open tab layout, and working directory; save them per-project and switch instantly; useful for monorepos where you work on different services throughout the day
- [ ] **AI-assisted git conflict resolution** — when a merge conflict is detected, surface a three-way diff view with an AI "resolve" button that proposes a merged result, explains the tradeoff, and lets you accept, edit, or reject per-hunk
- [ ] **AI code review** — on-demand review of the staged diff or a full PR; surfaced as inline comment suggestions anchored to the diff view, not just a flat chat response; one-click accept copies the suggestion as a code change
- [ ] **Semantic / AST-aware search** — search the codebase using structural patterns driven by tree-sitter queries (e.g., "all call sites of `fn foo`", "React hooks that depend on X") as an optional mode in the find-across-project panel
- [ ] **Embedded REPL panel** — run an interactive Python, Node.js, or other language REPL as a dockable panel; send the selected code from the editor into the REPL with a keybind; output persists in the panel until manually cleared
- [ ] **Multiplayer terminal view** — generate a local LAN URL that lets a collaborator view your terminal session read-only in their browser; no cloud relay, no accounts, session ends when you close the tab
- [ ] **Custom AI tool authoring** — write and test new agent tools in TypeScript using the Plugin API; a first-party SDK with type definitions, a local test harness, and one-command installation into a workspace
- [ ] **Streaming build errors → AI** — wire build-system panel failures directly into an AI turn automatically (opt-in per project); the agent sees the raw compiler output and proposes fixes without you having to copy-paste
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
