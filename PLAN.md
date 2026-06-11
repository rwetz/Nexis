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

### 1.19.0 — Persistent terminal sessions (planned)
> Working spec. Roadmap item promoted to Up next after 1.18.0.

PTY sessions survive Nexis restarts: relaunch the app and your shells are still there — scrollback, running processes, cwd. Two milestones, shippable independently.

#### Milestone A — scrollback continuity (no broker)
Visual persistence first: on exit, serialize each terminal tab's buffer; on relaunch, restore the scrollback into the new tab above a divider line, then start a fresh shell in the saved cwd. The process itself does not survive — this is "the terminal remembers what was on screen", which is most of the perceived value at a fraction of the risk.

**Scope:**
- Reuse the existing `SerializeAddon` snapshot path (renderer pool already serializes on slot release) — on app exit, write each terminal tab's serialized buffer to a per-session file under the user-only cache dir (`~/.cache/nexis/session-snapshots/`)
- Tab persistence gains a stable session id so a restored tab can find its snapshot across restarts
- On restore: write snapshot bytes into xterm before the PTY opens, print a themed `— session restored, previous shell ended —` divider, then spawn the shell in the saved cwd
- **Private tabs never persist** (matches the AI-redaction contract); snapshot files are deleted on tab close and on restore-disabled
- Setting: Settings → Terminal → "Restore scrollback on relaunch" (default on)

**Pitfall notes:** snapshot write must be atomic (tmp + rename, same rationale as `write_if_changed`); restore happens before first PTY byte so it can't interleave with live output; respect the 4 MiB pending-buffer cap when replaying (pitfall #7).

#### Milestone B — live process persistence (PTY broker)
The real feature: shells keep running while Nexis is closed. PTY ownership moves out of the app process into a small broker the app talks to.

**Scope:**
- Broker = the same `nexis` binary launched headless with a hidden flag (`nexis --pty-broker`) — no second binary, no bundle growth
- Transport: named pipe (Windows) / Unix domain socket (macOS, Linux, WSL) with a simple length-prefixed frame protocol: `open / write / resize / close / list / attach`, plus a streamed output channel per session
- Broker keeps a capped ring buffer of recent output per session; `attach` replays it so a reconnecting window repaints scrollback
- Lifecycle: app starts the broker on demand; sessions opted into persistence survive app exit; broker exits itself when its last session ends; stale-socket detection on startup
- Per-tab opt-in (context-menu "Keep alive after close") plus a global default setting; private tabs excluded by design
- Security: socket/pipe created with user-only permissions plus a random token handshake (file next to the socket, user-readable only) — terminal contents must not be readable by other local users

**Windows pitfalls to carry over:** `CONPTY_LIFECYCLE_LOCK` create/close serialization moves into the broker (pitfall #1A); broker spawn needs `hide_console` (pitfall #4); ConPTY handles cannot cross processes, so the broker owns the full PTY lifecycle and the app only ever sees the byte stream.

**Non-goals:** not a tmux clone — no server-side window management, no multi-client mirroring (the LAN share covers read-only viewing), no persistence across reboots.

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

### 0.8.3 — Formatter + settings dialog (shipped 2026-05-25)

- Code formatting — per-language formatter integration (`Shift+Alt+F`, format on save); Prettier, rustfmt, clang-format, black, gofmt; configurable via Settings → Formatters
- Settings converted from separate OS window to in-app modal dialog (blurred backdrop, centered, 920 × 700)

### 0.8.1 — Terminal keyboard fix (shipped 2026-05-24)

- Terminal keyboard input on fresh launch — writes queued until PTY IPC is ready

### 0.8.0 — Inline linting (shipped 2026-05-24)

- Inline linting and diagnostics — real-time editor gutter markers via `@codemirror/lint` for JS/TS, Python, Rust, Go, JSON, HTML, CSS, Markdown

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
