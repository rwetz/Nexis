# NEXIS.md

Nexis loads a `NEXIS.md` from the workspace root into every AI chat as project context (`modules/ai/lib/transport.ts` reads it, `agent.ts` appends it to the system prompt). `/init` in the composer writes one for any project. This file is the one for the Nexis repo itself. It has two jobs:

1. **Use Nexis** — what each surface does, how to open it, and how an agent drives it (the first half).
2. **Work on Nexis** — the architecture map and the traps (the second half).

It is loaded on every chat, so keep it dense. Depth lives in `docs/vault/` (start at `docs/vault/Home.md`); invariants live in `AGENTS.md`; what shipped lives in `CHANGELOG.md`.

---

## Part 1: Using Nexis

### The surface in one table

Nexis is a terminal-first ADE: tabs (terminal, editor, markdown, notebook, image, document, preview, AI diff, git views), a sidebar, a bottom panel, an AI drawer, and **seven tool windows** in the title bar. Tool display names changed over time; code and routes use the ids.

| Title bar | Id (`?tool=`) | Pack | What it does | Launch params |
|---|---|---|---|---|
| Vellum | `svg-studio` | `art` | SVG drawing, presets, optimizer, palette, backdrop, icon-set lint, favicon set, animator | `studio=draw\|palette\|backdrop\|icon-set\|favicon\|animator` |
| Synapse | `ml-lab` | `ml-lab` | Train small models with the Axon engine, playground, ONNX export | `project=<abs dir>`, `run=<run id>` |
| Portal | `web` | `web-dev` | Ports, HTTP client (`net::http_send`), JSON/JWT/encode/regex tools | `web=ports\|http-client\|web-tools` |
| Quill | `documents` | `documents` | Rich-text markdown and .docx, PDF export | none |
| Atlas | `atlas` | `dev-tools` | Every git repo on the machine: list and isometric map | none |
| Pulse | `benchmark` | `ml-lab` | Benchmark ONNX/GGUF models across backends (ONNX Runtime, llama.cpp, Axon, Simulated) | `model=<abs .onnx/.gguf>` |
| Epoch | `epoch` (page `epoch.html`) | `ml-lab` | Research studio: datasets (SQL), experiments, configs, models, over Nexis ML run stores | `project=`, `run=`, `dataset=` |

Every tool window also receives `root=<workspace>` from the main window. Packs gate features (`src/lib/packs.ts`, pref `enabledPacks`); a disabled pack's commands vanish and its views show an "enable?" placeholder.

### Ways in (for humans and agents)

- **Command palette** `Ctrl+Shift+P`: about 63 commands on main ("Show Tests", "Show Database", "Open Synapse (ML lab)", "Open the favicon exporter", "Find & replace in project", "Toggle zen mode", ...). This is the most reliable way to reach any panel.
- **Spotlight** `Ctrl+P` (files), **AI drawer** `Ctrl+I`, **settings** via palette "Open settings".
- **CLI:** `nexis <folder>` opens a workspace (several instances are allowed, one per project). `nexis --link "nexis://ml-lab?project=C:/abs/proj&run=<id>"` or `nexis://benchmark?model=C:/abs/model.onnx` opens Synapse or Pulse. A running Nexis receives the link over its loopback channel (`src-tauri/src/modules/links.rs`). Links only select things: tools `ml-lab` and `benchmark`, params `project|model|dataset` (absolute, no `..`) and `run`. A path outside the open workspace prompts first.
- **Explorer right-click** has per-type actions that the default click does not; for example, "Open Notebook" renders `.ipynb`, while a click or `Ctrl+P` opens the raw JSON.

### Feature recipes that are not obvious

- **Synapse:** "New model…" → pick a stock network (starters ship synthetic data) → name → Starter/Balanced/Ambitious → "Create <name>". It scaffolds `train.toml`, `PROJECT.md` and `data/*.csv` and trains through Axon (`axon` on PATH or the managed download in `<app local data>/engine/`). Runs land in `<project>/.nexis-ml/runs/<id>/` (`metrics.jsonl`, `summary.json`, checkpoints). "Try this model" serves it for live predictions; "Export ONNX model" writes `<project>/model.onnx`; "Benchmark in Pulse" and "Inspect run in Epoch" hand off with the params above.
- **Agent ML tools:** `ml_list_models`, `ml_predict` and `ml_rank_csv` (`src/modules/ml/lib/model-tools.ts`) are read-only and auto-approved. Training, writing or deleting must stay `approval: "ask"`.
- **Pulse:** a result is labelled `REAL` or `SIM`; only trust `REAL`. ONNX Runtime is real on Windows and Apple Silicon; llama.cpp needs a located `llama-bench`.
- **Quill:** saving markdown normalizes it (ATX headings, `-` bullets, `1.` lists, aligned tables). Files whose frontmatter, HTML or footnotes it would destroy open read-only (`detectMarkdownHazards`). PDF export (themes Minimal/Professional/Modern, A4/Letter) goes through a **native Save dialog**. "Word" creates `Untitled.docx` in the workspace with real Word styles.
- **Vellum:** every Save writes straight into the **workspace root** (`<name>.svg/.png`, `palette.css`, `public/` for the 8-file favicon set). No dialog.
- **Portal HTTP client:** requests go through Rust `net::http_send`, so CORS doesn't apply and localhost is allowed. Cloud-metadata hosts are always refused (`host not allowed`). It sends no default `User-Agent`; add one in Headers for APIs like GitHub.
- **Bottom panel:** Tests and Build run any shell command in the workspace and keep the output. Database (SQLite/Postgres/MySQL) shells out to the client CLI (`sqlite3`, `psql`, `mysql`), which must be on PATH. The REPL runs `python3`/`node`/`irb` in a PTY; on Windows `python3` is often the Store stub.
- **AI:** BYOK in Settings → Models (keys live in the OS keychain, service `nexis-ai`). Every provider goes through the Rust proxy (`proxyFetch.ts`): `cloudProxyFetch` for cloud providers, a private-network-allowed variant for local ones (Ollama, LM Studio, MLX, vLLM, xLLM, SGLang, OpenAI-compatible). Never call a provider with the webview's own `fetch`; the CSP blocks it (AGENTS.md pitfall #25). Agent tools: `read_file`, `list_directory`, `glob`, `grep`, `get_terminal_output`, `todo_write`, `suggest_command`, `open_preview`, `run_subagent` and `bash_logs/list/kill` run freely; `write_file`, `create_directory`, `edit`, `multi_edit`, `bash_run` and `bash_background` stop at an approval card, and file edits also open an AI diff tab with Accept/Reject. Personas: Coder, Architect, Code Reviewer, Security, Designer. Composer: `#` for snippets and commands, `@` for files, `/init`, `/plan`.

### Driving Nexis from an outside agent (WebDriver)

The repo's E2E harness is the supported way to script the real app on Windows (`docs/vault/subsystems/e2e-harness.md`).

- **Build:** `pnpm tauri build [--debug] --no-bundle --config src-tauri/tauri.e2e.conf.json` (800×600) or `tauri.screenshots.conf.json` (1600×1000). Both compile in DevTools port **9222** and use identifier `app.nexis.nexis.e2e`, so they never touch a real profile. A warm `CARGO_TARGET_DIR` makes this an incremental build of the `nexis` crate only.
- **Seed prefs before launch** in `%APPDATA%/app.nexis.nexis.e2e/nexis-settings.json`: `packsOnboarded: true`, `onboardingTourDone: true`, and `enabledPacks` (all ten ids, for full coverage). Otherwise a first-run modal covers everything.
- **Attach:** launch the exe with the workspace path, wait for `http://127.0.0.1:9222/json/version`, start an msedgedriver **matching the installed WebView2 Runtime version** (`edgedriver` package `download(<version>)`), and create a session with `ms:edgeOptions.debuggerAddress = "127.0.0.1:9222"` and `wdio:enforceWebDriverClassic: true`. Use Node 22.
- **Tool windows do not open under these overlays.** The overlay restates the whole window object (RFC 7386 replaces arrays), so a second webview hits WebView2 `0x8007139F` ("group or resource is not in the correct state") or fails silently, and the main window gains a native title bar. Instead, load a tool in the main webview: `location.assign("/?tool=ml-lab&root=<ws>")`; leave with `location.assign("/")`.
- **Epoch is the exception:** its backend commands are capability-scoped to the `nexis-epoch` window, so its route won't load in `main`. To exercise Epoch or real tool windows, build with an overlay that only changes `identifier` (no `app.windows`) and drive it with OS-level input.
- **Selectors that work:** palette input `input[placeholder="Type a command…"]` plus `[cmdk-item]`; Spotlight `[role="dialog"][aria-label="Spotlight"]`; bottom panel `[data-bottom-panel]`; title-bar tools `button[aria-label="Open <Name>"]`; the AI composer `textarea[aria-label="Message Nexis"]`; tool bodies under `main.nexis-window-body`.
- **DOM traps:** all bottom-panel tabs stay mounted, and Vellum's Draw tool stays mounted (hidden with `invisible`), so pick the *visible* match, not the first. A started REPL terminal can overlay other bottom-panel tabs and swallow clicks. Inputs are React-controlled: set them with the native value setter plus an `input` event, or with real WebDriver typing. A few toggles (Pulse backends) ignore synthetic `el.click()`; use a real WebDriver click. Native dialogs (PDF export) are outside the webview; confirm them with OS input (for example `wscript.shell` `AppActivate("Save As")` plus Enter).
- **Known issue on main (2026-10-15):** a fresh `pnpm install` with pnpm newer than the CI pin (11.10.0) fails on the unapproved `@nexis-epoch/desktop` build script, which also breaks `pnpm tauri build`; run `tsc && vite build` and `tauri build` with `"beforeBuildCommand": ""` as a stopgap.

---

## Part 2: Working on Nexis

### Snapshot

Open-source AI-native terminal and ADE. Rust + Tauri 2 backend, React 19 + TypeScript + xterm.js frontend, multi-provider AI via the Vercel AI SDK. Bundle id `app.nexis.nexis`; package manager pnpm; platforms Windows, macOS, Linux.

| Check | Command |
|---|---|
| Types | `pnpm exec tsc --noEmit` |
| Unit tests | `pnpm test` (includes the `src/lib/pitfall-guards.test.ts` tripwires) |
| Rust | `cd src-tauri && cargo check && cargo clippy -D warnings` (plus `tests/pitfall_invariants.rs`) |
| E2E | see "Driving Nexis" above, then `pnpm test:e2e` |

### Process boundary

The Rust process (`src-tauri/`) owns everything OS-level. The webview reaches it only through typed `invoke()` descriptors (`src/platform/ipc.ts`, `defineCommand(name, "workspace"|"host")`), registered in `src-tauri/src/lib.rs`. The full command map is `docs/vault/maps/ipc-surface.md`. Every non-PTY subprocess is built with `crate::modules::proc::command()` (it applies `CREATE_NO_WINDOW`; raw `Command::new` fails clippy and a tripwire). Workspace-scoped commands authorize paths with `workspace_authorize` before use.

### Windows

- **Main window** (`index.html`, `src/app/App.tsx` as coordinator). New features go in `src/modules/<area>/` or a capability under `src/capabilities/<area>/`, never into App.tsx.
- **Tool windows**: one per tool, label `nexis-<id>`, opened by `modules/window/toolWindow.ts:openToolWindow` (focus-or-create, params on the URL and on the `nexis://tool-window-opened` event). Contributions live in `src/capabilities/workbenches/` and `src/capabilities/atlas|benchmark|epoch`.
- **Epoch** is its own page (`epoch.html` → `src/windows/epoch.tsx`): Nexis Epoch's UI built from `@nexis-epoch/desktop` (pinned by commit) over `tauri-plugin-epoch`.
- **Settings** syncs across windows only through `writePref()` (it emits `nexis://prefs-changed`); never `store.set()` directly.

### Frontend conventions

- Tabs are a tagged union in `src/modules/tabs/lib/tabTypes.ts` (`terminal`, `editor`, `preview`, `markdown`, `notebook`, `image`, `document`, `ai-diff`, `git-diff`, `git-history`, `git-commit-file`, `ml-network`). Tabs are never unmounted on switch; they go `invisible pointer-events-none`, so PTYs and dev servers keep running.
- `@/*` maps to `src/*`; never use relative imports across module boundaries.
- UI: shadcn primitives in `src/components/ui/` (regenerate, don't hand-edit), Tailwind v4 via `@theme` in CSS (no `tailwind.config.*`), `cn()` from `@/lib/utils`.
- **Icons:** only through `src/components/icon.tsx` (Phosphor behind a semantic `IconName`); importing an icon vendor elsewhere fails a tripwire. No emoji in source or UI.
- Paths: split with `/[\\/]/`; the canonical frontend form is forward-slash.
- Zustand: select primitives or stable references (a tripwire checks this). Metric buffers and other hot data live outside stores.
- `AiComposerProvider` wraps App unconditionally; making it conditional remounts the tree and respawns every PTY.

### Terminal and shell integration

- `src-tauri/src/modules/pty/`: `portable-pty` sessions streamed over a Tauri `Channel`. Shell init scripts in `pty/scripts/` emit **OSC 7** (cwd) and **OSC 133 A/B/C/D** (prompt and command marks with exit code).
- **Windows:** `pwsh` → `powershell` → `cmd`. PowerShell starts with `-Command "if ($env:NEXIS_PWSH_PROFILE) { . $env:NEXIS_PWSH_PROFILE }"`, never `-File` (the first prompt is lost otherwise). `CONPTY_LIFECYCLE_LOCK` serializes ConPTY create and close; `pty_close` drops the session on a detached thread. Each child joins a kill-on-close Job Object (`pty/job.rs`). Send `\r` for Enter.
- `pty_open` callers must `workspace_authorize` the cwd first, or the terminal opens blank.

### AI subsystem (`src/modules/ai/`)

Providers and models: `config.ts`. Model construction: `lib/agent.ts:buildLanguageModel` (local providers get `localProxyFetch`). Reasoning blocks are pruned from history before compaction (Cerebras rejects them). Tools are in `tools/*.ts` (new ones via `pnpm tool:new`); `lib/security.ts` is a read/write path deny-list (`.env*`, `.ssh/`, credentials) that must not be bypassed. Sessions persist to `nexis-ai-sessions.json`. Subagents: `agents/registry.ts` + `tools/subagent.ts`.

### Adding a Tauri plugin

Add it to `Cargo.toml`, call `.plugin(...)` in `src-tauri/src/lib.rs`, and add its permission to `src-tauri/capabilities/*.json` (window-scoped capabilities, like Epoch's, only apply to the windows they name).

### Bundles

Windows: NSIS, `currentUser` mode (no admin), WebView2 via `embedBootstrapper`. macOS: min 10.15. Linux: deb/rpm/AppImage. The updater is minisign-verified against `https://github.com/rwetz/Nexis/releases/latest/download/latest.json`; shipping builds never use the E2E overlay.
