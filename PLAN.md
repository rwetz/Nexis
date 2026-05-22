# Release Plan

This document tracks what goes into each version of Nexis and how versioning works. It's updated before every release and serves as the working specification for what's being built.

---

## How versioning works

Nexis uses `MAJOR.MINOR.PATCH` loosely. Pre-1.0, the rules are:

| Bump | When |
|---|---|
| **Patch** (`0.7.x`) | Bug fixes, polish, small improvements, dependency updates. No new features that change how things work. |
| **Minor** (`0.x.0`) | New features, meaningful UX changes, anything that shifts how you interact with the app. May include breaking changes to config or storage formats. |
| **Major** (`x.0.0`) | 1.0 — stable public release. Everything before this is considered early access. |

Patch releases should be frequent and low-risk. Minor releases are bigger and get a CHANGELOG entry with real detail. Nothing gets tagged until it builds cleanly on all three platforms.

---

## Upcoming releases

---

### 0.7.1 — Terminal quality + session persistence
> Released: 2026-05-22

The goal of 0.7.1 is two things: make the terminal feel smarter day-to-day, and make the app feel like it actually remembers where you were. Small surface area, high daily impact.

#### Shell history search (Ctrl+R upgrade)
The built-in Ctrl+R is functional but basic. Replace it with a fuzzy, searchable overlay that shows full command history, filters as you type, and lets you run or edit before submitting. No AI involvement — fast, local, offline.

**Scope:**
- Intercept Ctrl+R in the terminal before it reaches the PTY
- Render a floating overlay with fuzzy-filtered history list
- Arrow keys to navigate, Enter to insert, Escape to dismiss
- Source: shell history file (`~/.zsh_history`, `~/.bash_history`, PowerShell history)

#### Terminal color themes
Currently the terminal inherits one hardcoded color palette. Add a set of built-in terminal themes (separate from the editor themes) selectable in Settings.

**Scope:**
- Built-in themes: Default Dark, Catppuccin Mocha, Dracula, Solarized Dark, One Dark, Nord
- Theme stored in settings, applied on terminal init and hot-swapped without restart
- Theme picker UI in Settings → Terminal

#### Tab and layout persistence
When Nexis restarts, it should come back to where you left it. Right now every launch starts blank.

**Scope:**
- Persist active tab list and layout (split state, tab order, tab type, cwd) to the store on exit
- Restore on next launch — terminal tabs reopen in the saved cwd, editor tabs reopen their file if it still exists
- Setting to disable restore (always start fresh)

#### Quick file open (Cmd+P)
File exploration with the sidebar is fine for browsing, but jumping directly to a known file by name should be instant.

**Scope:**
- `Cmd+P` / `Ctrl+P` opens a fuzzy file search overlay
- Searches the current workspace root, respects `.gitignore`
- Selecting a file opens it in a new editor tab
- Keyboard-only navigation, Escape to close

#### Bug fixes and cleanup
- Fix any regressions from the 0.7.0 rebrand
- Dependency version sweep
- Rust clippy clean pass
- TypeScript strict mode violations cleanup

---

### 0.8.0 — AI depth + SSH (planned)
> Rough target after 0.7.x stabilizes

- SSH support — PTY sessions over SSH
- AI context inspector — transparency panel showing what context the agent is working with
- Agent orchestration — spawn and coordinate external agents (Claude Code, OpenCode)
- Per-project AI system prompt via `NEXIS.md`
- Smarter AI autocomplete in the editor (project-aware)
- Fix "Check for updates" button in About — currently does nothing; wire up the updater plugin properly or replace with a direct GitHub releases check

---

### 0.9.0 — IDE features begin (planned)
> Long lead time — details TBD

- Full LSP integration (language servers for go-to-definition, hover, diagnostics)
- Integrated debugger — first runtime targets TBD (likely Node.js and Python)
- Refactoring engine foundations

---

### 1.0.0 — Stable release (target)
> When the core is solid enough to call done

- All non-negotiables hardened and production-tested
- Code signing on all platforms (no SmartScreen warning)
- Full documentation
- Stable plugin/skill API if that's happening

---

## Release checklist

Before tagging any version:

- [ ] `pnpm exec tsc --noEmit` passes
- [ ] `cargo clippy` clean, `cargo fmt` applied
- [ ] `pnpm test` and `cargo test` pass
- [ ] Builds and runs on macOS, Linux, and Windows
- [ ] CHANGELOG.md updated with the new version entry
- [ ] Version bumped in `package.json` and `src-tauri/Cargo.toml`
- [ ] Git tag pushed (`git tag vX.X.X && git push origin vX.X.X`)
- [ ] GitHub release created with release notes
