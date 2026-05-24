# Roadmap

Where Nexis is heading, what's already in, and what I'm deliberately not building.

This gets updated as things shift. Day-to-day tracking lives in [GitHub Issues](https://github.com/rwetz/Nexis/issues).

---

## The point of Nexis

A terminal that treats AI as a first-class citizen — not a chatbot glued to the side, but something woven into the actual workflow. Fast, small, cross-platform, no cloud lock-in. You bring your own keys or run local models entirely offline.

The non-negotiables: terminal correctness, PTY fidelity, under 10 MB, no telemetry.

## Hard limits (things that won't be built)

- **Not a VS Code replacement.** Full LSP, a refactoring engine, and a debugger are all on the longer-term roadmap, but the goal is a focused terminal-first tool — not a feature-for-feature IDE clone.
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

## What's shipped

### Terminal
- [x] Multi-tab terminal with WebGL rendering
- [x] Native PTY (zsh, bash, pwsh, fish, cmd)
- [x] Split panes
- [x] Shell integration — cwd tracking, prompt markers
- [x] Inline search, link detection, true-color
- [x] Private tabs with AI context redaction
- [x] WSL as a first-class workspace environment
- [x] Shell history search — fuzzy Ctrl+R overlay sourced from shell history, keyboard-navigable
- [x] Tab and layout persistence — terminal tabs (with working directory) and editor tabs restored on relaunch
- [x] Configurable terminal font family, size, letter spacing, and scrollback buffer

### Editor
- [x] CodeMirror 6 with broad language support (TS/JS, Rust, Python, HTML/CSS, JSON/JSONC, Markdown, Go, C/C++, Java, C#, PHP, Ruby, SQL dialects (PostgreSQL/MySQL/SQLite/MSSQL/PL-SQL), YAML, TOML, Shell/Bash, Dockerfile)
- [x] Inline AI autocomplete
- [x] AI-proposed edit diffs with per-hunk approval
- [x] Vim mode
- [x] Prebuilt editor themes

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

### Markdown
- [x] Markdown preview tab — right-click any `.md` file in the explorer to open a rendered preview

### Git & Source Control
- [x] Stage, unstage, commit, branch
- [x] Commit graph and history viewer
- [x] Per-file diffs
- [x] AI commit message generation — one-click Conventional Commit subject line from the staged diff
- [x] Syntax-highlighted diffs — language-aware coloring in the CodeMirror unified diff view; colored +/- lines in the binary/large-file patch fallback

### AI
- [x] Multi-provider BYOK — OpenAI, Anthropic, Google, Groq, xAI, Cerebras, DeepSeek, Mistral, OpenRouter, OpenAI-compatible
- [x] Offline models via LM Studio, MLX, and Ollama — no API key required
- [x] Multi-agent and sub-agents
- [x] Voice input
- [x] Slash commands and skills
- [x] Project memory and per-project AI system prompt via `NEXIS.md`
- [x] File, shell, search, and plan tools with approval flow
- [x] Workspace file picker
- [x] Auto-compaction for long sessions

### Web Preview
- [x] Auto-detected local dev server preview
- [x] Image and PDF viewers
- [x] Sandboxed iframe

### Platform & Infrastructure
- [x] macOS, Linux (.deb / .rpm / AppImage), Windows (NSIS)
- [x] WSL support
- [x] AUR package
- [x] Windows Explorer context menu
- [x] Auto-updater
- [x] OS keychain for API keys
- [x] SSRF and DNS rebinding protection
- [x] Sandboxed AI tool surface
- [x] Windows subprocess console flash suppressed (`CREATE_NO_WINDOW` on all spawned commands)
- [x] ConPTY lifecycle race fixed — create and close serialized to prevent blank-terminal bug

---

## What's coming

### Near-term
- [ ] Redesigned sidebar, source control panel, and git graph — visual refresh of the left panel and git history view
- [ ] Redesigned Models settings tab — cleaner model picker with better scroll and layout
- [ ] SSH — PTY sessions over SSH (auth + known_hosts first; SFTP and port forwarding later)
- [ ] Inline terminal suggestions — history-based to start, AI-powered as opt-in
- [ ] Smarter AI autocomplete — project-aware context, lower latency
- [ ] Drag and drop into terminal — files as quoted paths, files as AI context attachments
- [ ] Agent orchestration — Nexis spawning and coordinating external coding agents (Claude Code, OpenCode, etc.)
- [ ] AI context inspector — transparency panel showing exactly what context is being sent to the model
- [ ] Better approval flow — project-scoped auto-approve policies, per-tool trust levels
- [ ] Environment variable panel — view, edit, and persist env vars per workspace
- [ ] Background process manager — visibility into shell background jobs and dev servers running in Nexis
- [ ] Code formatting — per-language formatter integration (Prettier, rustfmt, clang-format, etc.) triggered from the editor with config UI
- [ ] Run files — execute the current file or project directly from the editor with output captured in a terminal tab
- [ ] Draggable/dockable panels — resizable bottom output panel to start, with drag-to-dock for floating and snapping panels
- [ ] Inline linting and diagnostics — real-time error and warning markers in the editor gutter via @codemirror/lint, backed by standalone linters (ESLint, Clippy, etc.)

### Longer term
- [ ] Full LSP support — go-to-definition, hover docs, diagnostics, and completion powered by language servers
- [ ] Debugger and debugging tools — step-through debugging, breakpoints, variable inspection, and call stack viewer for common runtimes (Node.js, Python, Rust via LLDB)
- [ ] Refactoring engine — rename symbols, extract functions, and structured code edits across a project
- [ ] Integrated build system — trigger builds (cargo, pnpm, make, gradle) from inside the app with output captured in a dedicated panel and errors linked to source lines
- [ ] Test runner panel — run and watch test suites (Vitest, cargo test, pytest, JUnit) with pass/fail tree, inline failure markers, and re-run on save
- [ ] Snippets library — user-defined code snippets with tab-stop placeholders, scoped by language
- [ ] Multi-cursor and column select — advanced editing modes for bulk edits across lines
- [ ] Find and replace across project — workspace-wide search and replace with regex, preview, and per-file confirmation
- [ ] Minimap — optional code minimap in the editor for navigating large files
- [ ] Breadcrumb navigation — file path + symbol breadcrumbs at the top of the editor pane
- [ ] Symbol outline panel — file-level function/class/variable tree in the sidebar
- [ ] Bookmarks — mark lines across files and jump between them quickly
- [ ] Code folding improvements — fold by indent, by region comments, and by language constructs
- [ ] Word wrap toggle — per-file and global word wrap setting in the editor
- [ ] AI PR description generation — draft pull request titles and bodies from branch diff
- [ ] AI-powered rename — rename a symbol across the project with AI verifying correctness
- [ ] Workspace templates — scaffold new projects from built-in or custom templates
- [ ] Keybinding editor — visual UI for remapping any shortcut, with import/export
- [ ] Command palette — fuzzy-searchable palette for every action in the app (Ctrl+Shift+P)
- [ ] Notifications center — in-app log of agent actions, build results, and background task completions
- [ ] Remote workspaces — open a remote directory over SSH with the editor, explorer, and terminal all pointed at the same host
- [ ] Container-aware environments — detect and work inside Docker/devcontainer setups, surface container context in the status bar
- [ ] Database query tab — run queries against local SQLite, PostgreSQL, and MySQL databases directly in Nexis
- [ ] AI skill bundles — installable packages that add new agent tools and slash commands
- [ ] Tab groups / named workspaces — group tabs by project and switch between workspace sets
- [ ] Collaborative sessions — shared terminal and editor sessions for pair programming
- [ ] Release tooling — automated CHANGELOG generation, version bumps, and tag flow
- [ ] Bundle size work — tree-shaking, lazy language packs, targeted dependency replacements
- [ ] Selective TS → Rust migration for measurable hot-path wins
- [ ] Live file system sync — explorer and editor update in real time as files change on disk
- [ ] Plugin API — stable internal API surface so features can be built and loaded as first-party plugins
- [ ] Mobile companion — read-only terminal and AI chat view for iOS/Android

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
