<div align="center">
  <img src="public/logo (1) (1).png" width="144" height="144" alt="Nexis" />
  <h1>Nexis</h1>

  <p><strong>Open-source lightweight cross-platform AI-native terminal (ADE)</strong></p>

  <p>
    <img src="https://img.shields.io/badge/version-0.7.0-blue" alt="version" />
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

**Editor**
- CodeMirror 6 with syntax highlighting for TS/JS, Rust, Python, HTML/CSS, JSON, Markdown, and more
- AI-powered inline autocomplete and diff-based edits
- Vim keybindings
- Themes: Tokyo Night, Nord, GitHub, Atom One, Aura, Copilot, Xcode

**File Explorer**
- Catppuccin icon theme
- Fuzzy search, keyboard nav, inline rename, right-click context actions

**Web Preview**
- Automatically picks up running local dev servers and opens them in a tab

**AI — bring your own keys**
- Works with OpenAI, Anthropic, Google, Groq, xAI, Cerebras, or any OpenAI-compatible endpoint
- Fully offline via LM Studio
- Voice input, multi-agent support, slash commands, skills
- Drop a `NEXIS.md` in your project root for persistent AI context
- All file/shell operations require your approval before running

**General**
- ~7 MB bundle
- API keys live in your OS keychain, never on disk
- No accounts, no telemetry

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
