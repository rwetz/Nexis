# Roadmap

Where Nexis is heading, what's already in, and what I'm deliberately not building.

This gets updated as things shift. Day-to-day tracking lives in [GitHub Issues](https://github.com/rwetz/Nexis/issues).

---

## The point of Nexis

A terminal that treats AI as a first-class citizen — not a chatbot glued to the side, but something woven into the actual workflow. Fast, small, cross-platform, no cloud lock-in. You bring your own keys or run local models entirely offline.

The non-negotiables: terminal correctness, PTY fidelity, under 10 MB, no telemetry.

## Hard limits (things that won't be built)

- **Not a VS Code replacement.** No full LSP, no integrated debugger, no refactoring engine. Use a real IDE for that.
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

### Editor
- [x] CodeMirror 6 with broad language support (TS/JS, Rust, Python, HTML/CSS, JSON, Markdown, Go, C/C++/Java/C#, PHP)
- [x] Inline AI autocomplete
- [x] AI-proposed edit diffs with per-hunk approval
- [x] Vim mode
- [x] Prebuilt themes

### File Explorer
- [x] Catppuccin / Material icon theme
- [x] Fuzzy search, keyboard navigation, inline rename, context menu

### Git & Source Control
- [x] Stage, unstage, commit, branch
- [x] Commit graph and history viewer
- [x] Per-file diffs

### AI
- [x] Multi-provider BYOK — OpenAI, Anthropic, Google, Groq, xAI, Cerebras, OpenAI-compatible
- [x] Offline models via LM Studio
- [x] Multi-agent and sub-agents
- [x] Voice input
- [x] Slash commands and skills
- [x] Project memory via `NEXIS.md`
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

---

## What's coming

### Near-term
- [ ] SSH — PTY sessions over SSH (auth + known_hosts first; SFTP later)
- [ ] Inline terminal suggestions — history-based to start, AI-powered as opt-in
- [ ] Theming — terminal color schemes, UI accents, custom keybindings
- [ ] Smarter AI autocomplete — project-aware, lower latency
- [ ] Drag and drop into terminal — files as quoted paths, files into AI context
- [ ] Agent orchestration — Nexis spawning and coordinating external agents (Claude Code, OpenCode, etc.)
- [ ] Better approval flow — project-scoped auto-approve policies, per-tool trust levels
- [ ] Persistent session and layout restore

### Longer term
- [ ] Release tooling (automated CHANGELOG, version bumps, tag flow)
- [ ] Bundle size work — tree-shaking, lazy language packs
- [ ] Selective TS → Rust for measurable hot-path wins
- [ ] AI skill bundles as installable packages
- [ ] Live file system sync in explorer and editor

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
