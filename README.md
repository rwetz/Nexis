<div align="center">
  <img src="public/logo (1) (1).png" width="144" height="144" alt="Nexis" />
  <h1>Nexis</h1>

  <p><strong>Open-source lightweight cross-platform AI-native terminal (ADE)</strong></p>

  <p>
    <img src="https://img.shields.io/badge/version-0.7.4-blue" alt="version" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="platform" />
  </p>
</div>

---

Nexis is a lightweight, AI-first terminal built on Tauri 2, Rust, and React 19. It gives you a native PTY backend, multi-tab terminals, a built-in code editor, a file explorer, and an AI panel that runs on your own API keys — or entirely offline with LM Studio. Stays under 10 MB, stores keys in your OS keychain, and collects zero telemetry.

## Based on Terax

Nexis started as a personal fork of [terax-ai](https://github.com/crynta/terax-ai) — a great open-source AI terminal by [@crynta](https://github.com/crynta). The core architecture, PTY backend, and AI tooling are all rooted in that work. Nexis builds on top of it with my own branding, logo, tweaks, and direction going forward.

If you're looking for the upstream project, head over to [crynta/terax-ai](https://github.com/crynta/terax-ai). If you want my personal take on it, you're in the right place.

## Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/terminal.png" alt="Terminal" /><br/><sub>Multi-tab terminal with WebGL rendering</sub></td>
    <td align="center"><img src="docs/web-preview.png" alt="Web preview" /><br/><sub>Web preview of local dev servers</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/ai-workflow.png" alt="AI window" /><br/><sub>AI agentic workflow with edit diffs in the code editor</sub></td>
  </tr>
</table>

## What's inside

**Terminal**
- xterm.js with WebGL rendering, multiple tabs, background streaming
- Native PTY via `portable-pty` — works with zsh, bash, pwsh, fish, cmd
- Shell integration for cwd tracking and prompt markers
- Inline search, clickable links, full true-color support
- Shell history search (Ctrl+R) — fuzzy overlay sourced from `~/.zsh_history`, `~/.bash_history`, fish history, or PowerShell history
- Built-in ANSI palette switcher in Settings → Themes: Default Dark, Catppuccin Mocha, Dracula, Nord, Solarized Dark, One Dark — hot-swaps without restart

**Editor**
- CodeMirror 6 with syntax highlighting for TS/JS, Rust, Python, HTML/CSS, JSON, Markdown, and more
- AI-powered inline autocomplete and diff-based edits
- Vim keybindings
- Editor themes: Tokyo Night, Nord, GitHub, Atom One, Aura, Copilot, Xcode
- Quick file open (Ctrl+P / Cmd+P) — fuzzy workspace file picker that respects `.gitignore`

**Themes**
- Full app theme system with built-in themes: Nexis Default, Catppuccin, Nord, Tokyo Night, Gruvbox, Rose Pine, Sage, Tide, Caffeine, Claude
- Custom themes — create, import, and delete `.nexis-theme` files from Settings → Themes; live color swatch previews
- Theme editor — Create/Edit opens `.nexis-theme` directly in the code editor; Create generates a starter file and adds it to custom themes automatically
- Background images — set a local image with adjustable opacity (0–100%) and blur (0–64px); all stored locally, no cloud dependency

**File Explorer**
- Catppuccin icon theme
- Fuzzy search, keyboard nav, inline rename, right-click context actions

**Web Preview**
- Automatically picks up running local dev servers and opens them in a tab

**Git & Source Control**
- Stage, unstage, commit, and push without leaving the app
- AI commit message generation — one-click Conventional Commit subject lines from the staged diff, with auto-repair pass if the first attempt is malformed
- Syntax-highlighted diff viewer — language-aware coloring for working-tree and commit diffs via CodeMirror's unified merge view; binary and large-file fallback renders colored +/- patch lines
- Commit graph with branch lanes, author avatars, and per-commit file list popover

**AI — bring your own keys**
- Works with OpenAI, Anthropic, Google, Groq, xAI, Cerebras, or any OpenAI-compatible endpoint
- Fully offline via LM Studio
- Voice input, multi-agent support, slash commands, skills
- Drop a `NEXIS.md` in your project root for persistent AI context
- All file/shell operations require your approval before running

**General**
- Tab and layout persistence — terminal tabs (with working directory) and editor tabs saved on change and restored on next launch; toggle in Settings → General → Startup
- ~7 MB bundle
- API keys live in your OS keychain, never on disk
- No accounts, no telemetry

## Terminal

### Keyboard shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| New terminal tab | `Cmd+T` | `Ctrl+T` |
| New private terminal | `Cmd+R` | `Ctrl+R` |
| New editor tab | `Cmd+E` | `Ctrl+E` |
| Close tab / pane | `Cmd+W` | `Ctrl+W` |
| Next tab | `Ctrl+Tab` | `Ctrl+Tab` |
| Previous tab | `Ctrl+Shift+Tab` | `Ctrl+Shift+Tab` |
| Jump to tab 1–9 | `Cmd+1`–`Cmd+9` | `Ctrl+1`–`Ctrl+9` |
| Split pane right | `Cmd+D` | `Ctrl+D` |
| Split pane down | `Cmd+Shift+D` | `Ctrl+Shift+D` |
| Focus next pane | `Cmd+]` | `Ctrl+]` |
| Focus previous pane | `Cmd+[` | `Ctrl+[` |
| Find in terminal | `Cmd+F` | `Ctrl+F` |
| Shell history search | `Ctrl+R` | `Ctrl+R` |
| Word forward | `Alt+→` | `Alt+→` |
| Word back | `Alt+←` | `Alt+←` |
| Delete word | `Cmd+Backspace` | `Ctrl+Backspace` |
| Newline without execute | `Shift+Enter` | `Shift+Enter` |
| Zoom in | `Cmd+=` | `Ctrl+=` |
| Zoom out | `Cmd+-` | `Ctrl+-` |
| Reset zoom | `Cmd+0` | `Ctrl+0` |
| Toggle sidebar | `Cmd+B` | `Ctrl+B` |
| Toggle AI panel | `Cmd+I` | `Ctrl+I` |
| Toggle git panel | `Cmd+G` | `Ctrl+G` |
| Quick file open | `Cmd+P` | `Ctrl+P` |
| Search in files | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Settings | `Cmd+,` | `Ctrl+,` |
| Keyboard shortcuts reference | `Cmd+K` | `Ctrl+K` |

### Features

**Tabs & panes**
- Unlimited tabs; mouse-wheel scrolls the tab bar horizontally
- Split any tab into side-by-side or stacked panes — each pane is an independent PTY session
- Tab and pane state (working directory) persists across restarts — toggle in Settings → General → Startup

**Find in terminal**
- `Enter` — next match; `Shift+Enter` — previous match; `Esc` — dismiss
- Matches highlighted with decorations; active match shown in orange

**Shell history search (`Ctrl+R`)**
- Fuzzy overlay over the prompt — does **not** auto-execute; press `Enter` to insert, `Esc` to cancel
- Sources `~/.zsh_history`, `~/.bash_history`, fish history, or PowerShell `PSReadLine` history automatically

**Shell integration**
- OSC 7 — tracks the current working directory as you `cd`
- OSC 133 — marks prompt boundaries so the AI can tell commands from output
- Supported shells: zsh, bash, fish, PowerShell (`pwsh` / `powershell.exe`), cmd.exe

**Private terminals**
- Open with `Cmd+R` / `Ctrl+R`; shown with an incognito indicator in the tab bar
- AI tools cannot read the scrollback or buffer of a private terminal

**Rendering & display**
- WebGL-accelerated renderer (opt-out in Settings → Terminal)
- Full true-color (24-bit) and clickable hyperlinks
- Configurable font family, font size, letter spacing, and scrollback buffer size
- Cursor style: block when focused, outline when blurred

**Themes**
- Eight built-in ANSI palettes hot-swap without restart: Default Dark, Catppuccin Mocha, Dracula, Nord, Solarized Dark, One Dark — set in Settings → Themes
- Background image with adjustable opacity (0–100%) and blur (0–64 px)

**AI integration**
- AI can read up to 2 000 lines of terminal scrollback via the `get_terminal_output` tool (private tabs excluded)
- `suggest_command` — AI proposes a command; click to insert at the prompt (never auto-executes)
- `open_preview` — AI can open a localhost URL in a preview tab

## Platform notes

**Windows**
- First launch may show a SmartScreen warning since there's no code-signing cert yet. Hit **More info → Run anyway** — this is expected for unsigned open-source software.
- Shell detection order: `pwsh.exe` → `powershell.exe` → `cmd.exe`

**Linux**
- AppImage requires FUSE. No FUSE? Run with `--appimage-extract-and-run`. Wayland rendering issues? Try `WEBKIT_DISABLE_DMABUF_RENDERER=1`. The `.deb` / `.rpm` builds are usually smoother on desktop Linux.

## Setting up AI

1. Go to **Settings → AI**
2. Choose a provider and drop in your API key
3. For local models, point it at your LM Studio URL

Keys are stored in the OS keychain via Rust's `keyring` crate — they never hit disk or localStorage.

## Building from source

**You'll need:**
- Rust (stable) — https://rustup.rs
- Node 20+ and [pnpm](https://pnpm.io)
- Tauri platform prerequisites — https://tauri.app/start/prerequisites/

```bash
pnpm install
pnpm tauri dev        # dev mode
pnpm tauri build      # production build
```

**Type and lint checks:**
```bash
pnpm exec tsc --noEmit
cd src-tauri && cargo clippy
```

## Stack

Tauri 2 · Rust · `portable-pty` · React 19 · TypeScript · xterm.js · CodeMirror 6 · Vercel AI SDK v6 · Tailwind v4 · shadcn/ui · Zustand

## Contributing

PRs and issues are welcome. Check [CONTRIBUTING.md](CONTRIBUTING.md) before opening anything non-trivial.

## License

Apache-2.0. See [LICENSE](LICENSE).
