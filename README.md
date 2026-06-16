<div align="center">
  <img src="public/logo (1) (1).png" width="144" height="144" alt="Nexis" />
  <h1>Nexis</h1>

  <p><strong>Open-source lightweight cross-platform AI-native terminal (ADE)</strong></p>

  <p>
    <img src="https://img.shields.io/badge/version-1.19.0-blue" alt="version" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="platform" />
  </p>
</div>

---

Nexis is a lightweight, AI-first terminal and developer environment built on Tauri 2, Rust, and React 19. Native PTY backend, multi-tab terminals, a full code editor, file explorer, source control, and an AI panel that runs on your own API keys — or entirely offline with LM Studio, MLX, or Ollama. Under 10 MB, keys stored in the OS keychain, zero telemetry.

## Based on Terax

Nexis started as a personal fork of [terax-ai](https://github.com/crynta/terax-ai) — an open-source AI terminal by [@crynta](https://github.com/crynta). The core PTY architecture and AI tooling are rooted in that work. Nexis builds on top with its own direction, branding, and a much expanded feature set.

If you want the upstream project: [crynta/terax-ai](https://github.com/crynta/terax-ai).

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

### Terminal
- xterm.js with WebGL rendering, unlimited tabs, split panes
- Native PTY — works with zsh, bash, pwsh, fish, cmd
- Shell integration: cwd tracking (OSC 7), prompt markers (OSC 133), and **OSC 0/2 tab titles** — shells and programs (vim, ssh, htop) update the tab label automatically
- **Configurable cursor** — choose bar / block / underline and toggle blinking from Settings → General
- Inline search, clickable links, true-color (24-bit)
- Shell history search (`Ctrl+R`) — fuzzy overlay over `~/.zsh_history`, `~/.bash_history`, fish, or PSReadLine; inserts without auto-executing
- Private terminals — AI cannot read scrollback; shown with incognito indicator
- WSL as a first-class workspace environment
- Tab and pane layout persists across restarts
- Configurable font family, font size, letter spacing, scrollback buffer
- Inline AI command suggestions — history-aware, never auto-execute
- **Terminal recording** — capture a session to a file for playback or sharing
- **Live terminal sharing** — serve a read-only live view of your terminal (or AI conversation) to any device on your LAN; WebSocket push the instant output arrives, with SSE fallback
- Drag files into the terminal as quoted paths or AI context attachments

### Editor
- CodeMirror 6 with syntax highlighting for TS/JS, Rust, Python, HTML/CSS, JSON/JSONC, Markdown, Go, C/C++, Java, C#, PHP, Ruby, SQL dialects, YAML, TOML, Shell/Bash, Dockerfile
- **AI inline autocomplete** — context-aware completions with configurable provider and model
- **AI diff approval** — AI-proposed edits shown as per-hunk diffs; approve or reject each change individually
- **Semantic symbol rename** (`F2`) — LSP-powered rename across the project when a language server is running (only true references change), with a word-boundary text find/replace fallback and preview dialog when none is
- **LSP refactorings** (`Ctrl+Shift+R`) — extract function and inline variable via language-server code actions, applied as workspace edits; every affected open tab reloads instantly
- **Code minimap** — 52 px minimap with line-type coloring and click-to-scroll; viewport indicator
- **Jupyter notebook viewer** — right-click any `.ipynb` to open a static cell viewer; renders code, markdown, stream, and error outputs without a kernel
- Vim mode
- Inline linting — Lezer-based real-time syntax error markers for JS/TS, Python, Rust, Go, JSON, HTML, CSS, Markdown
- Code formatting — Prettier, rustfmt, clang-format, black, gofmt, and more; configurable per language; runs on save or `Shift+Alt+F`
- Code folding — fold by indent, region comments, and language constructs
- Word wrap toggle — per-file and global
- Snippet library — tab-stop snippets scoped by language
- Breadcrumb navigation — file path + symbol crumbs at the top of the editor
- Symbol outline panel — file-level function/class/variable tree in the sidebar
- Find and replace across the project — workspace-wide regex search with per-file preview and confirmation
- Quick file open (`Ctrl+P` / `Cmd+P`) — fuzzy workspace picker that respects `.gitignore`
- Live file system sync — editor and explorer update in real time as files change on disk
- Run current file — execute via a configured command with output captured in a terminal tab

### Language Tooling
- **Full LSP support** — go-to-definition, hover docs, completion, and diagnostics from real language servers; a Rust proxy handles protocol negotiation and session lifecycle
- **DAP debugger** — breakpoint gutter, step-through controls (over / in / out / continue), variable inspector, and call stack panel; Node.js, Python, and LLDB-based runtimes
- **Problems panel** — file-grouped error/warning list with filtering and a status-bar indicator

### Themes
- Built-in app themes: Nexis Default, Catppuccin Mocha, Nord, Tokyo Night, Rosé Pine, Gruvbox, Caffeine, Claude, Sage, Tide
- Custom themes — create, import, and delete `.nexis-theme` files; live swatch preview
- Theme editor — open any `.nexis-theme` directly in the code editor
- Background images with adjustable opacity (0–100%) and blur (0–64 px)
- Terminal color palettes built into each theme

### File Explorer
- Catppuccin / Material icon themes, with a vscode-icons fallback so ecosystem folders (NuGet, Maven, Kotlin, iOS, Flutter, MongoDB, …) get purpose-built art
- Fuzzy search, keyboard navigation, inline rename, context menu
- Right-click `.md` files → **Open Preview** for rendered Markdown
- Right-click `.ipynb` files → **Open Notebook** for the static cell viewer

### Git & Source Control
- Stage, unstage, commit, branch — all without leaving the app
- Commit graph and history viewer with branch lanes
- Per-file diffs with syntax highlighting
- **AI commit message generation** — one-click Conventional Commit subject lines from the staged diff
- **AI PR description generation** — draft pull request titles and bodies from the branch diff
- Syntax-highlighted unified diff view
- **Git stash manager** — list, create, apply, pop, and drop stashes directly from the source control panel
- **Conflict resolver** — side-by-side merge editor for resolving merge conflicts without leaving the app
- **Git worktrees** — create, switch, and remove worktrees from the sidebar
- **Workspace notes** — per-workspace scratch pad that persists alongside your project

### AI
- **12+ providers** — OpenAI, Anthropic, Google, Groq, xAI, Cerebras, DeepSeek, Mistral, OpenRouter, OpenAI-compatible endpoints, **Hugging Face Inference API**
- **Fully offline** — LM Studio, MLX, and Ollama; no API key required
- Multi-agent and sub-agents with tool approval flows
- **Agent queue** — queue follow-up tasks while an agent is running; they execute in order
- **Semantic search** — embed and search codebase symbols and docs for AI context retrieval
- Voice input — Whisper transcription via OpenAI
- Slash commands and skills
- Project memory via `NEXIS.md` in your project root
- File, shell, search, and plan tools — all require explicit approval before execution
- Workspace file picker for attaching files as AI context
- Auto-compaction for long conversations
- **AI context inspector** — transparency panel showing exactly what context goes to the model
- **AI inline explain** — select any terminal output or code and click "Explain"; the AI answers in the mini window without disrupting your flow
- **Terminal → AI** — select terminal output, click "Ask Nexis" or "Explain" to send it to the AI chat
- **AI explain commit** — click any commit in git history and get a plain-English breakdown of what changed and why
- **Prompt templates** — save and reuse common AI prompts with `{VAR}` placeholder substitution
- Dockable AI panel — resize, float, and snap-to-dock

### ML Lab
- **Train small models locally** — a sidebar panel for training models on your own data, no cloud and no accounts. Powered by a small local engine (`nexis-ml`) that the panel installs or downloads for you; everything runs on your machine.
- **Two engines, one panel** — a PyTorch-based **Python engine** (the full feature set) or a **standalone Rust engine** (a single ~31 MB binary, no Python/PyTorch needed, that trains tabular & image models on CPU or any GPU via `wgpu`). The panel auto-detects whichever is present and only ever shows the options that engine supports.
- **Templates** — Spreadsheet (tabular neural net), Text generator (a tiny GPT you can watch learn to write), Image classifier (a small CNN over folders of images), and Blank (design your own network in `train.py`). One-click **Create & train** scaffolds an example project with sample data — live results within seconds.
- **Plain-language training** — live charts with friendly metric names ("Accuracy", not `acc/val`), a progress bar with elapsed time, and a trend-aware status sentence that explains what the model is doing, including an overfitting warning when validation worsens. Raw logs stay in a collapsed Details disclosure.
- **Inference playground** — load a trained model and try it live: a prompt → continuation box for text, a feature form → prediction with probability bars for tabular.
- **Run browser & comparison** — every run is saved with its metrics; annotate with notes/tags, pin a baseline, and overlay 2+ runs on shared charts to compare. Confusion matrices and sample-prediction grids render inline.
- **Hyperparameter form & HTML report export** — tweak `train.toml` keys without leaving the panel, and export a self-contained HTML report (charts + summary + samples) of any run in one click.

See **[ML_LAB_GUIDE.md](ML_LAB_GUIDE.md)** for the full how/why guide and **[ML_SUITE.md](ML_SUITE.md)** for the architecture, protocol, and roadmap.

### Sidebar Panels
| Panel | What it does |
|---|---|
| **Files** | File explorer with icons, search, and rename |
| **Recent Files** | MRU list of opened and AI-edited files with fuzzy search, relative timestamps, and per-entry removal |
| **Source Control** | Git stage / commit / diff |
| **Activity** | Background jobs and dev servers with live log streaming, plus the AI agent task queue — kill processes and stop queued or running agent tasks from one place |
| **Debugger** | DAP step-through debugging with variables and call stack |
| **Share** | LAN share of the terminal or AI conversation; live WebSocket streaming |
| **Ports** | Detect listening ports, open in web preview with one click, or forward over SSH |
| **Outline** | Symbol tree for the active file |
| **Snippets** | Create and manage code snippets |
| **Tests** | Run Vitest / cargo test / pytest / JUnit with pass/fail tree |
| **ML Lab** | Train small ML models on your own data — live charts, templates, an inference playground, and a run browser |
| **Database** | Connection manager for SQLite, PostgreSQL, MySQL; schema browser, table viewer, AI-assisted query editor |
| **Build** | Detect and run cargo, pnpm, make, gradle, go, and more |
| **SSH** | Save SSH connections; **Connect** opens a new terminal tab with the command pre-executed |
| **Release** | Current version, commits since last tag, one-click changelog copy, git tag creation |

### Web Preview
- Auto-detected local dev server preview
- Image and PDF viewers
- Sandboxed iframe

### Platform
- macOS, Linux (.deb / .rpm / AppImage), Windows (NSIS / MSI)
- AUR package
- WSL support
- Windows Explorer context menu — right-click folders and drives to open in Nexis
- Auto-updater
- OS keychain for API keys — never written to disk
- SSRF and DNS rebinding protection
- Sandboxed AI tool surface
- **Container-aware environments** — detects `.devcontainer`, `docker-compose.yml`, `Dockerfile` in the workspace; surfaces a status-bar pill
- **Python environment awareness** — auto-detects virtualenvs, conda, and `pyproject.toml`; surface active env in the status bar with quick-switch
- **React error boundary** — render crashes in any pane are contained locally; the rest of the UI stays live with a "Try again" reset

---

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| New terminal tab | `Cmd+T` | `Ctrl+T` |
| New private terminal | `Cmd+R` | `Ctrl+R` |
| New editor tab | `Cmd+E` | `Ctrl+E` |
| Close tab / pane | `Cmd+W` | `Ctrl+W` |
| Next tab | `Ctrl+Tab` | `Ctrl+Tab` |
| Previous tab | `Ctrl+Shift+Tab` | `Ctrl+Shift+Tab` |
| Jump to tab 1–9 | `Cmd+1–9` | `Ctrl+1–9` |
| Split pane right | `Cmd+D` | `Ctrl+D` |
| Split pane down | `Cmd+Shift+D` | `Ctrl+Shift+D` |
| Focus next pane | `Cmd+]` | `Ctrl+]` |
| Find in terminal | `Cmd+F` | `Ctrl+F` |
| Shell history search | `Ctrl+R` | `Ctrl+R` |
| Quick file open | `Cmd+P` | `Ctrl+P` |
| Search in files | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Command palette | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Format document | `Shift+Alt+F` | `Shift+Alt+F` |
| Rename symbol | `F2` | `F2` |
| Refactor (LSP code actions) | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| Fold all | `Cmd+K Cmd+0` | `Ctrl+K Ctrl+0` |
| Unfold all | `Cmd+K Cmd+J` | `Ctrl+K Ctrl+J` |
| Toggle sidebar | `Cmd+B` | `Ctrl+B` |
| Toggle AI panel | `Cmd+I` | `Ctrl+I` |
| Zoom in / out / reset | `Cmd+=` / `Cmd+-` / `Cmd+0` | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Settings | `Cmd+,` | `Ctrl+,` |
| Keyboard shortcuts | `Cmd+K` | `Ctrl+K` |

---

## Setting up AI

1. Open **Settings → AI**
2. Choose a provider and paste your API key
3. For local/offline models, point it at your LM Studio, MLX, or Ollama URL

Keys are stored in the OS keychain via Rust's `keyring` crate — they never hit disk or localStorage.

### Supported providers

| Provider | Key required |
|---|---|
| OpenAI | Yes |
| Anthropic | Yes |
| Google Gemini | Yes |
| Groq | Yes |
| xAI Grok | Yes |
| Cerebras | Yes |
| DeepSeek | Yes |
| Mistral | Yes |
| OpenRouter | Yes |
| Hugging Face | Yes (free tier available) |
| OpenAI-compatible | Depends on endpoint |
| LM Studio | No — local only |
| MLX | No — local only |
| Ollama | No — local only |

---

## Platform notes

**Windows**
- First launch may show a SmartScreen warning (no code-signing cert yet). Hit **More info → Run anyway**.
- Shell detection order: `pwsh.exe` → `powershell.exe` → `cmd.exe`

**Linux**
- AppImage requires FUSE. No FUSE? Run with `--appimage-extract-and-run`.
- Wayland rendering issues? Try `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- The `.deb` / `.rpm` builds are usually smoother on desktop Linux.

---

## Building from source

**Prerequisites:**
- Rust (stable) — https://rustup.rs
- Node 22+ and [pnpm](https://pnpm.io) 11+
- Tauri platform prerequisites — https://tauri.app/start/prerequisites/

```bash
pnpm install
pnpm tauri dev        # dev with hot reload
pnpm tauri build      # production build
```

**Tests:**
```bash
pnpm test                                   # Vitest unit tests
cd src-tauri && cargo test                  # Rust unit tests
pnpm test:e2e                               # WebdriverIO E2E tests (requires a release build)
```

**Type and lint checks:**
```bash
pnpm exec tsc --noEmit
cd src-tauri && cargo clippy
```

---

## Stack

Tauri 2 · Rust · `portable-pty` · React 19 · TypeScript · xterm.js · CodeMirror 6 · Vercel AI SDK v6 · Tailwind v4 · shadcn/ui · Zustand

---

## Contributing

PRs and issues are welcome. Check [CONTRIBUTING.md](CONTRIBUTING.md) before opening anything non-trivial. See [ROADMAP.md](ROADMAP.md) for what's planned and [good-first-issue](https://github.com/rwetz/Nexis/labels/good-first-issue) / [help-wanted](https://github.com/rwetz/Nexis/labels/help-wanted) labels for tracked tasks.

## License

Apache-2.0. See [LICENSE](LICENSE).
