# NEXIS.md

Drop this file in a project root and Nexis will load it as persistent AI context — similar to how Claude Code uses `CLAUDE.md` or OpenAI uses `AGENTS.md`. It's also the canonical architecture reference for the Nexis codebase itself.

---

## Project snapshot

**Nexis** — open-source AI-native terminal. Rust + Tauri 2 backend, React 19 + TypeScript + xterm.js frontend, multi-provider AI via Vercel AI SDK v6.

| Thing | Value |
|---|---|
| Bundle ID | `app.nexis.nexis` |
| Package manager | pnpm |
| Platforms | macOS, Linux, Windows |
| Frontend check | `pnpm exec tsc --noEmit` |
| Rust check | `cd src-tauri && cargo check && cargo clippy` |

---

## Architecture

### Two processes, clear boundary

The **Rust process** (`src-tauri/`) owns everything OS-level. The webview has no direct FS, process, or shell access — it goes through `invoke()` to named commands registered in `src-tauri/src/lib.rs`.

Key command groups:

- `pty::pty_*` — long-lived interactive PTY sessions. Each session is a `portable-pty` pair tracked in `PtyState` (`RwLock<HashMap<id, Session>>`). Output streams to the frontend via a Tauri `Channel<PtyEvent>`.
- `fs::tree::*`, `fs::file::*`, `fs::mutate::*` — file explorer reads and writes.
- `fs::search::*`, `fs::grep::*` — fuzzy file finder and content search, backed by the `ignore` and `grep-*` crates.
- `shell::shell_run_command` — one-shot subshell exec for AI tool calls. Not the user's interactive terminal. Windows uses `powershell -NoProfile -Command`, Unix uses `$SHELL -lc`.
- `shell::shell_session_*` — stateful persistent shell for the agent (survives across tool calls).
- `shell::shell_bg_*` — long-running background processes (e.g. dev servers) with ring-buffer log capture.
- `secrets::secrets_*` — OS keychain via `keyring`. Service name: `nexis-ai`. Linux falls back to a file-based store on systems without a keychain daemon.
- `open_settings_window` — spawns the settings webview window.

### Shell integration

Init scripts live in `src-tauri/src/modules/pty/scripts/` and are injected at shell start:

**Unix** — `zshenv.zsh`, `zprofile.zsh`, `zlogin.zsh`, `zshrc.zsh`, `bashrc.bash`. Installed via `ZDOTDIR` override (zsh) or `--rcfile` (bash). They emit:
- **OSC 7** — current working directory
- **OSC 133 A/B/C/D** — prompt start/end and command start/end markers, plus exit code

**Windows** — `profile.ps1`, passed to `pwsh -NoLogo -NoExit -ExecutionPolicy Bypass -File <path>`. Wraps the existing `prompt` function after `$PROFILE` runs. Same OSC 7 + 133 output. Shell priority: `pwsh.exe` → `powershell.exe` → `cmd.exe`. cwd gets normalized to backslashes before going to ConPTY — `CreateProcessW` chokes on forward slashes.

`pty/shell_init.rs` is split by `#[cfg(unix)]` / `#[cfg(windows)]` — new platform code goes in the right arm.

**Windows-specific PTY notes:**
- `SPAWN_LOCK` (Mutex) wraps `openpty + spawn_command`. Concurrent spawns without it produce PTYs with stalled output pipes. Don't remove the lock.
- Each ConPTY child joins a **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (see `pty/job.rs`). When the Nexis process exits — clean or otherwise — the kernel kills all shell descendants. Without this, Windows orphans the entire process subtree since `TerminateProcess` only kills the direct child.

**`AiComposerProvider` mount:** it wraps App.tsx unconditionally. Making it conditional causes a parent element type change when keys load, which remounts the entire tree and re-spawns every PTY. Keep it unconditional.

### Frontend

Single-window React app. `@/*` maps to `src/*`.

Tabs are a tagged union: `{ kind: "terminal" | "editor" | "preview" | "ai-diff", … }`. Tabs are **never unmounted on switch** — they go `invisible pointer-events-none` so PTYs and dev servers keep running in the background.

`App.tsx` is a coordinator. New features belong inside `modules/<area>/`, not in App.tsx.

### Module map (`src/modules/`)

Each module is self-contained with a barrel export at `index.ts` and hooks under `lib/`.

**terminal/** — `TerminalStack` mounts one xterm instance per tab via `useTerminalSession` and `pty-bridge`. OSC 7 and OSC 133 parsing in `osc-handlers.ts`. Windows drive-letter normalization happens here: `/C:/Users/foo` → `C:/Users/foo`.

**editor/** — CodeMirror 6 editor stack. `extensions.ts` handles language detection. Supports vim mode and all bundled themes.

**explorer/** — file tree with Catppuccin/Material icons. Fuzzy search, keyboard nav, inline rename, context menu. `basename` handles both `/` and `\`.

**preview/** — dev-server preview tab. Status bar auto-detects a localhost URL and suggests opening it.

**tabs/** — `useTabs` owns the tab list and active id. `useWorkspaceCwd` derives the explorer root and default cwd for new tabs from the currently active tab.

**header/** — top bar and `SearchInline` (adapts to terminal vs editor context). `WindowControls` renders on Linux and Windows; macOS uses native traffic lights.

**statusbar/** — bottom bar with `CwdBreadcrumb`. Handles Unix paths, Windows drive letters, and `~` expansion via `pathUtils.segmentsFromCwd`.

**shortcuts/** — keymap registry and `useGlobalShortcuts`. All handlers are registered in App.tsx and referenced by string id. Uses `metaKey || ctrlKey` for Cmd/Ctrl cross-platform.

**settings/** — settings store (`tauri-plugin-store`), preferences hook, settings window opener.

**updater/** — auto-updater UI on top of `tauri-plugin-updater`.

**ai/** — see below.

### AI subsystem (`src/modules/ai/`)

BYOK, multi-provider via `@ai-sdk/*`: OpenAI, Anthropic, Google, Groq, xAI, Cerebras, OpenAI-compatible (covers LM Studio and any OpenRouter-style endpoint).

Provider list and model defaults live in `config.ts`.

**Keys** — read/written through `secrets_*` Rust commands. Keyring service: `nexis-ai`. Never persist to disk, settings store, or localStorage.

**Agent** (`lib/agent.ts`) — `Experimental_Agent` from the AI SDK. Uses `stopWhen: stepCountIs(MAX_AGENT_STEPS)`. System prompt from `config.ts`. Provider branching lives here.

**Sub-agents** (`agents/registry.ts`, `agents/runSubagent.ts`) — named sub-agents with isolated system prompts and tool subsets. Invoked by the main agent via `run_subagent` tool.

**Sessions** (`lib/sessions.ts` + `store/chatStore.ts`) — named conversation sessions. Persisted to `nexis-ai-sessions.json` via `tauri-plugin-store`. The chat store is a module-scoped `Map<sessionId, Chat<UIMessage>>`; `getOrCreateChat()` lazily hydrates from disk. `AgentRunBridge` syncs active session messages to disk continuously and derives titles from the first user message. Swapping the API key clears the in-memory map; sessions on disk survive.

**Composer** (`lib/composer.tsx`) — React context managing shared input state (text, file attachments, selections, voice). Selections are attached via `attachSelection(text, source)` and serialized as `<selection source="terminal|editor">…</selection>` at submit. Derives `isBusy` from agent status — safe to mount before sessions hydrate.

**Tools** (`tools/tools.ts`) — `read_file`, `list_directory`, `fs_search`, `fs_grep` run automatically. `write_file`, `create_directory`, `rename`, `delete`, `run_command`, `shell_session_run`, `shell_bg_spawn` gate on `needsApproval: true` and pause for an in-UI approval card. `lib/security.ts` is a path deny-list (`.env*`, `.ssh/`, credentials, keychain dirs) — applied on both read and write paths. Don't bypass it.

**Edit diffs** — AI-proposed file edits open in a side-by-side `ai-diff` tab. The user accepts or rejects per hunk before the actual write fires.

### UI

- **shadcn/ui** — primitives in `src/components/ui/`. Regenerate with `pnpm dlx shadcn add`, don't hand-edit. Composition wrappers go in `modules/ai/components/`.
- **Tailwind v4** — configured in `src/App.css` via `@theme`. Use `cn()` from `@/lib/utils`. No `tailwind.config.*`.
- **Icons** — HugeIcons via the `hugeicons` library.
- **Animation** — `motion` (Framer Motion v11+). Resizable panels — `react-resizable-panels`.
- **Path imports** — always `@/…`, never relative across module boundaries.
- **Path separators** — use `.split(/[\\/]/)` anywhere a path might come from OSC 7, the OS, or the explorer. Canonical form on the frontend is forward-slash. Convert Windows backslashes at the boundary (App.tsx `setHome`).

### Window chrome

- **macOS** — `titleBarStyle: Overlay` + `hiddenTitle: true` for native traffic lights.
- **Linux** — `decorations: false` + `transparent: true`, re-asserted after window realize for GNOME/Mutter CSD.
- **Windows** — same flags as Linux. Custom `WindowControls` component renders min/max/close buttons.

### Adding a plugin

When you add a new Tauri plugin, three things need updating:
1. `Cargo.toml` — add the dependency
2. `src-tauri/src/lib.rs` — call `.plugin(...)` in `run()`
3. `src-tauri/capabilities/default.json` — add the permission entry

### Cross-platform notes

- Use the `dirs` crate for home/cache dirs. Never hardcode `$HOME` or `%USERPROFILE%`.
- New platform-specific shell init code goes in the right `#[cfg(unix)]` / `#[cfg(windows)]` arm.
- Send `\r` (CR) for Enter in the terminal — PowerShell requires CR, not LF.

### Bundle targets

- **macOS** — min version `10.15`
- **Linux** — deb: `libwebkit2gtk-4.1-0`, `libgtk-3-0` / rpm: `webkit2gtk4.1`, `gtk3` / AppImage bundles its own media stack
- **Windows** — NSIS in `currentUser` mode (no admin required), WebView2 via `embedBootstrapper`
- **Auto-updater** — minisign-verified; latest manifest at `https://github.com/rwetz/Nexis/releases/latest/download/latest.json`

---

## Known gotchas

**React 19 Strict Mode in dev** — effects double-mount, so you'll see `pty opened id=1` then `pty closed id=1` immediately. The `SPAWN_LOCK` serializes the race. Normal, ignore it.

**Windows process cleanup** — `killer.kill()` from `portable-pty` only kills the direct child. The Job Object in `pty/job.rs` handles cascading kills when Nexis itself exits. An explicit `pty_close` from JS still only kills the direct child and relies on the Job for the rest. Don't remove the Job Object.

**Tab cwd on Windows** — OSC 7 delivers cwd with forward slashes (after `parseOsc7` strips the leading `/C:` → `C:`). Any code that passes `tab.cwd` into a Rust FS call on Windows needs to normalize separators — `pty::shell_init::apply_common` does this for PTY spawn; other call sites handle their own.
