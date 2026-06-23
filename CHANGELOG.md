# Changelog

All notable changes to Nexis. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (pre-`1.0`, minor bumps may include breaking changes).

## [1.20.2] — 2026-06-22

A reliability, security, and supply-chain hardening pass — no user-facing features, just CI gates, panic-safety, and resource ceilings. Also makes `CHANGELOG.md` the canonical record (see Docs) and retires the `IDEAS.md` brainstorm (its content moved into `ROADMAP.md`'s hardening backlog).

### Added
- **Binary-size budget gate** — the release workflow fails if `nexis.exe` exceeds 10 MiB, making the "<10 MB" non-negotiable actually enforced so a careless dependency can't quietly blow the budget (currently ~8.4 MiB).
- **Coverage gate** — CI now runs `pnpm test:coverage` instead of bare `pnpm test`; the `vitest.config.ts` thresholds were raised from 40/35/45/40 to just below the current numbers (lines/statements ~72%, branches ~82%, functions ~56%), so a real coverage regression fails the build.
- **`cargo-deny` supply-chain gate** — `src-tauri/deny.toml` adds a license allow-list, advisory checks, and a source-registry lock on top of `cargo audit`, run by the weekly `audit.yml` workflow (and on any `Cargo.lock`/`deny.toml` change). Documented exceptions cover unmaintained *transitive* Tauri dependencies (the gtk-rs GTK3 bindings, the rust-unic Unicode tables, proc-macro-error) that have no fix path.
- **Panic-lint gate** — `src-tauri/clippy.toml` plus `#![warn(clippy::unwrap_used, clippy::expect_used)]` on the security-critical command modules (`net`, `secrets`, `recording`) make a new `.unwrap()`/`.expect()` in their production code a CI failure (test code is exempt via `allow-unwrap-in-tests`).

### Changed
- **All GitHub Actions are pinned to a commit SHA** (with the tag in a trailing comment) across the CI, audit, release, and E2E workflows, so a re-pointed tag can't swap in unreviewed action code. `dtolnay/rust-toolchain` gained an explicit `toolchain: stable` input to remain pinnable.
- Marked the `nexis` crate `publish = false` and documented the intentionally-minimal `rt`-only `tokio` feature set in `Cargo.toml` (a contributor note tied to the size budget).

### Fixed
- **PTY thread-spawn no longer panics on exhaustion** — if the reader/flusher/waiter thread fails to spawn (OS thread limit / OOM), the spawn path now kills the child shell and unwinds cleanly via a new `ThreadSpawnGuard` instead of `.expect()`-panicking on a Tauri worker thread (which could take down the whole process — pitfall #9 territory).

### Security
- **Buffer ceilings** (defense against unbounded growth): terminal recordings are capped (a 64 MiB frontend accumulation ceiling with a truncation notice, plus a 512 MiB Rust-side guard on the saved `.cast` payload); the AI message history gained a hard context-window backstop so a single very large recent tool result can't push the history past the model's window; and the explorer live-sync re-list fan-out is bounded.
- **Audited minimal Tauri capability surface** — verified every granted capability in `capabilities/*.json` maps to a real feature (no blanket `fs:`/`shell:`/`http:` grants) and documented the posture in `SECURITY.md`.

### Docs
- **CHANGELOG is now the canonical, contiguous record.** Backfilled the entirely-missing 1.3.0–1.14.0 history (12 releases, ~25 features — stash manager, port forwarding, REPL, AI code review, multi-window, worktrees, bookmarks, and more) and the undocumented 1.20.1 visual/provider work. Retired ROADMAP's ~150-line "Shipped" section in favor of a pointer to this file; `CLAUDE.md` now codifies keeping the changelog current as a top priority and the roadmap as a disposable to-do list.

## [1.20.1] — 2026-06-18

A look-and-feel pass that spreads the AI panel's polish across the whole app, four new AI providers, full editor split-pane parity with the terminal, and an explorer-stability fix.

### Added
- **New AI providers** — **Z.ai** (Zhipu GLM) cloud provider with 7 GLM models (GLM-4.6 / 4.5 / 4.5-X / Air / AirX / Flash / 4.5V) via its OpenAI-compatible endpoint (`api.z.ai/api/paas/v4`), plus three LM Studio-style local providers — **vLLM**, **xLLM**, and **SGLang** — each with its own icon and a configurable base URL + model id in the LOCAL & CUSTOM list. All four are threaded through chat, inline autocomplete, and commit/PR generation, persist via `writePref`, and the local ones satisfy the composer's local-model gate.
- **Editor split panes** — editor tabs now split into multiple file panes just like the terminal (`Ctrl+D` split right, `Ctrl+Shift+D` split down), each independently resizable and closable, up to 4 panes per tab. Opening a file while a split pane is focused loads it into that pane (unless it has unsaved changes), so you can view different files side by side. Split layouts persist across restart.
- **Close panes individually** — a hover ✕ on each terminal/editor pane, shown only when a tab is split.
- **Move panes** — reorder a pane within its split with `Ctrl+Alt+Arrow`.
- **Command exit-status gutter** — `OSC 133;D` exit codes now paint a thin green/red gutter bar on each command's line (xterm decorations anchored to the prompt marker), so success/failure is scannable down the scrollback. Degrades silently where decorations aren't available; the cwd-gating path is untouched. (The achievable slice of command blocks — full Warp-style interactive blocks would need replacing the WebGL renderer.)
- **ML training progress on the OS taskbar** — a training run mirrors its progress onto the taskbar/dock icon via `setProgressBar` (normal / paused / indeterminate), cleared when the run ends.
- **Per-branch source-control accent** — the source-control panel gets a peacock-style top strip whose color is a stable hash of the current branch name, so branches are distinguishable at a glance.
- **Motion system** — shared spring/tween presets (`lib/motion.ts`) and a root `<MotionConfig reducedMotion="user">`, so animations share one vocabulary and respect `prefers-reduced-motion`.
- **Themed toasts** — a Sonner `<Toaster>` at the app root; the explorer's rename / delete / reveal errors now surface as toasts instead of `window.alert()`. (Adds the `sonner` dependency.)
- **Sliding brand tab indicator** — one shared-layout (`layoutId`) element that springs between tabs with a glow, replacing the static per-tab accent line.
- **Theme-aware brand accent** — `applyTheme` now sources `--brand` from each theme's signature ring color, so the tab indicator, composer aurora, and active-pane glow all match the active theme and crossfade with it (the default theme keeps coral).
- **Signature effects** — a rotating brand conic "aurora" border on the composer while the agent works; an inset brand glow on the focused split pane (multi-pane only); a terminal file-drop overlay; a glassy command palette; an AI code-block copy button that springs copy → green check; and a reduced-motion-aware crossfade when the theme palette/mode changes.
- **New reusable UI components** — `<ScrollFade>` (scroll affordance) and `<KbdHint>` (keyboard-hint pill).

### Fixed
- **Focused-pane indicator** — the brand-colored focus ring no longer leaks as a stray line along the bottom of the active pane. It's now rendered as a clean overlay ring on all four sides (previously an inset shadow that the terminal canvas hid on three edges, leaking only through xterm's bottom row-rounding gap).
- **Explorer folder-icon cache poisoning** — folder/file icon URLs were being cached as `""` when looked up before the icon JSON finished loading, permanently breaking the default folder icon (the empty box before the workspace name). The negative cache is now skipped while the icon set is still loading, and the tree re-renders once `preloadIcons()` resolves so icons fill in immediately.
- **Explorer live-sync flicker** — the 3 s live-sync poll flipped each node to "loading" (clearing its entries) before `fs_read_dir` resolved, flashing the list empty every cycle. The poll now does a background fetch that keeps the loaded rows on screen and swaps in new entries only on success.

### Changed
- The split-pane tree is now generic and shared between terminal and editor tabs.
- **macOS ML standalone-engine download deferred** — `ml_engine_release_url` now returns `None` on macOS (no prebuilt `nexis-ml-rs` asset is published — the Intel runner kept hanging), so the panel guides Mac users to the Python engine instead of offering a 404 download.

## [1.20.0] — 2026-06-17

ML Lab grows up: the rest of the ML Suite's **Phase 2** (inference + richer graphs) and **Phase 3** (a Python-free engine) ship here. Still an early feature — verified end-to-end, but young.

### Added
- **More templates** — Text generator (a tiny character-level GPT over any `.txt`, streaming a generated-text snapshot each pass), Image classifier (a folder-per-class CNN with a per-epoch sample-prediction grid), and Blank (scaffold your own `train.py`). The create card scaffolds and trains any of them in one click.
- **Inference playground** — load a trained model and try it live without leaving the panel: prompt → continuation for text, a feature form → class + probability bars for tabular. Backed by `nexis-ml serve` (an NDJSON request/response loop); started per-run and torn down on navigation to free GPU memory.
- **Run browser, comparison & annotation** — past runs list with final metrics; check 2+ to overlay them on shared charts (one color per run), and annotate each with notes, tags, and a pin-to-top "baseline" marker (`notes.json` per run).
- **Confusion matrices & sample grids** — classification runs render a colored confusion matrix (accuracy + per-cell counts); image runs render a green/red sample-prediction grid — live and for historical runs.
- **Hyperparameter form** — edit the keys present in `train.toml` (epochs / lr / batch / device / model size …) with Save and Save & train; surgical value replacement preserves comments, alignment, and line endings.
- **HTML report export** — one-click self-contained report of any run (inline SVG charts, summary, confusion matrix, sample grid, generated-text samples, config) via `nexis-ml export`.
- **Pause / resume, early stopping & GPU-memory telemetry** — Pause/Resume honored at the epoch boundary; the harness exposes `run.should_stop(patience=…)`; CUDA runs plot a per-epoch `mem/gpu_mb` footprint.
- **Auto-open on train** — an opt-in, cross-window-synced preference that opens the panel automatically when training starts.
- **Standalone Rust engine (no Python)** — Nexis can detect and download [nexis-ml-rs](https://github.com/rwetz/nexis-ml-rs), a single ~31 MB binary that trains tabular and image models on CPU or any GPU (burn's `wgpu` backend — no CUDA toolchain) and exports a tabular model to ONNX. It speaks the same protocol and writes the same run store, so the panel renders its runs unchanged. The setup card offers a one-click "Download standalone engine" alongside the Python install.
- **Engine-aware UI** — the panel identifies which engine is active (from `nexis-ml env`) and gates features to it: the config-only Rust engine hides the Text generator and Blank templates (which need an editable `train.py`) and the GPU/CUDA upsell, showing only what it can do, with a hint pointing to the Python engine for the rest.

### Fixed
- The setup card now surfaces *why* engine setup, install, or download failed instead of failing silently, and "Create & train" reports why it didn't start.
- The engine install falls back to installing from GitHub when the package isn't on PyPI yet, and the project folder is authorized (not merely checked) before `ml_spawn`.
- ML engine/Python path guards parse the executable stem host-independently (split on both `/` and `\`), so engine detection behaves identically on Windows and Unix.

### Security
- The standalone-engine download (`ml_download`) only fetches over HTTPS into a managed app-data directory and verifies the binary with a `--version` probe before it can be spawned; the spawn guard still requires the executable's stem to be exactly `nexis-ml`.

## [1.19.0] — 2026-06-12

ML Lab: train small machine-learning models inside Nexis. An early feature — functional and verified end-to-end, but young; expect rough edges.

### Added
- **ML Lab panel** — a new sidebar view (own rail icon, pinned by default with a one-time promotion for existing rails) for training small models on your own data. Live charts with plain-language metric names ("Accuracy", not `acc/val`), a progress bar with elapsed time, and a trend-aware status sentence that explains what the model is doing — including an overfitting warning when validation worsens. Raw logs live in a collapsed Details disclosure. A status-bar pill shows progress and jumps to the panel.
- **External engine, LSP-style** — the heavy lifting happens in [nexis-ml](https://github.com/rwetz/nexis-ml) (Python/PyTorch, Apache-2.0), spawned over an NDJSON stdio protocol. The Nexis binary stays under 10 MB; the panel degrades to an actionable setup card when the engine is missing.
- **One-click setup and project creation** — the panel installs the engine into the detected venv (CPU or CUDA torch, fixed pip-argument allowlist on the Rust side), scaffolds an example project, and starts training in a single Create & train click. Past runs render from on-disk `metrics.jsonl` with no engine running.
- **GPU training** — `device = "auto" | "cpu" | "gpu"` per project; `auto` uses the GPU only when the job is big enough to benefit and says why. NVIDIA detection via `nvidia-smi`, engine capability probe via `nexis-ml env`, an install-time GPU checkbox, and an "Enable GPU" upgrade path that handles pip's refusal to swap `+cpu` for `+cuXXX` builds (`--force-reinstall`).

### Security
- New `ml_*` Tauri commands are deliberately narrow: only an executable whose stem is `nexis-ml` (or a CPython launcher, for installs) can be spawned, subcommands and pip invocations are fixed allowlists, and project directories pass the same `authorize_spawn_cwd` guard as terminal spawns. All spawn sites use `CREATE_NO_WINDOW` (pitfall #4).

## [1.18.1] — 2026-06-11

Shortcut polish, a test-suite expansion that caught three real bugs, and CI maintenance.

### Fixed
- **LSP refactor shortcut is now rebindable** — `editor.codeActions` (default `Ctrl+Shift+R` / `Cmd+Shift+R`) was display-only in Settings → Shortcuts with the key hardcoded in the editor keymap, so remapping it had no effect. It now dispatches through the global shortcut system like Format document: the editor pane exposes `openCodeActions()`, the app routes the binding to the active editor, and the shortcut falls through harmlessly when the active tab isn't an editor.
- **Unix paths from language servers lost their leading slash** — `uriToPath` stripped all three slashes from `file:///home/...`, turning absolute paths relative and silently breaking go-to-definition and workspace edits on macOS/Linux. Windows drive paths were unaffected.
- **Share-server connections could die instantly on Windows** — sockets accepted by the LAN share server inherit the listener's non-blocking mode, so per-connection reads (request headers, WebSocket ping/close frames) could fail immediately with `WouldBlock`; the WS reader thread died at spawn, leaving ping/close handling dead. Accepted sockets are now reset to blocking, and WS clients register for broadcasts before the handshake response so a push can't slip past a freshly connected viewer.
- **Same-position LSP inserts applied in reverse order** — `applyEditsToText` applied multiple zero-width inserts at one position bottom-up without a tiebreak, reversing the array order the LSP spec mandates.

### Tests
- **Suite grown from 105 to 142 Vitest tests and 126 to 130 Rust tests** — new suites for LSP URI/hover protocol helpers, share-page HTML escaping (untrusted terminal/AI content), shortcut matching and registry invariants (duplicate ids, conflicting default bindings), and explorer icon resolution (catppuccin→vscode-icons fallback chain); plus WebSocket frame-length boundary tests and real loopback integration tests of the share server (RFC 6455 handshake with the spec example key, broadcast delivery, masked close, 400 on missing key). The three fixes above all fell out of these tests.

### CI
- **GitHub Actions bumped for the Node 24 runner switchover** (forced June 16, 2026): `actions/checkout` v4→v6, `actions/setup-node` v4→v6, `pnpm/action-setup` v4→v6 across all workflows, and `softprops/action-gh-release` v2→v3 in the release workflow.

## [1.18.0] — 2026-06-11

WebSocket live terminal sharing, LSP extract/inline refactorings, instant tab reload after multi-file edits, and a richer folder icon set.

### Added
- **WebSocket live terminal view** — the LAN share server gains a `/ws` endpoint (RFC 6455 handshake and framing implemented stdlib-only, with unit tests against the RFC vectors) so live terminal viewing pushes the instant output arrives instead of on the ~2 s SSE poll. The shared page connects via WebSocket and falls back to the kept `/stream` SSE endpoint automatically. The app now pushes on terminal output events (debounced to one push per ~120 ms burst) via a new zero-cost-when-idle output-listener registry in `useTerminalSession`. The view stays read-only by design — the server has no auth, so client frames are never forwarded to the terminal.
- **LSP refactorings: Extract Function / Inline Variable (Ctrl+Shift+R)** — a new editor dialog lists `refactor.*` code actions from the language server for the current selection (extract function and inline variable sorted first) and applies the chosen workspace edit to disk. Actions without a literal edit are resolved via `codeAction/resolve` (`resolveSupport`/`dataSupport` now advertised); command-only actions run through `workspace/executeCommand`. The buffer is saved before requesting actions so edits are computed against disk content. Listed in the shortcuts dialog as a display-only Editor entry.
- **LSP proxy answers server→client requests** — the Rust session reader previously dropped server-initiated requests (emitting them as events without replying), which stalls servers that block on the response. It now acks `workspace/applyEdit` (forwarding the edit to the frontend applier), answers `workspace/configuration` with per-item nulls, accepts `client/(un)registerCapability`, `window/workDoneProgress/create`, and `window/showMessageRequest`, and returns `-32601` for anything else.
- **vscode-icons folder fallback** — the explorer falls back to a pruned `@iconify-json/vscode-icons` subset (folder types only, light-theme and `-opened` variants dropped; 179 icons, ~420 KB lazy chunk, regenerated via `pnpm icons:folders`) when catppuccin has no folder match. `dotnet` now resolves to NuGet art and `jvm` to Maven instead of the old lib/gradle aliases; Kotlin, iOS, Flutter, Electron, MongoDB, and ~170 other ecosystem folders get purpose-built icons. `mobile`/`devops` keep their catppuccin approximations — no dedicated art exists in either set.

### Fixed
- **Hidden editor tabs went stale after multi-file edits** — `applyWorkspaceEdit` (LSP rename/refactor) and the text-rename fallback now broadcast the rewritten paths via a `nexis:files-rewritten` event, and every open editor pane force-reloads its file immediately instead of only the active tab (the rest previously waited for FS sync to catch up).

## [1.17.0] — 2026-06-11

Unified activity view, cancellable agent tasks, and semantic LSP rename.

### Added
- **Unified Activity panel** — the background-process manager and the AI agent queue are merged into a single sidebar view (relabeled "Activity"). Background shell processes can be killed and queued/running agent tasks stopped from one place. Resolves the "Background job viewer + canceler" roadmap item.
- **Stop a running agent task** — the agent queue can now abort an *in-flight* task, not just queued ones. It calls the chat store's `stop()` to unwind the agent turn and finalizes the task as `cancelled` (a new, retryable status). Previously only queued/done/failed tasks could be removed; a running task had no cancel control.
- **Semantic rename via LSP (F2)** — symbol rename now issues `textDocument/rename` when a language server is active and applies the returned WorkspaceEdit across files, so only true references change (not comments, strings, or substrings). It falls back to the previous word-boundary text find/replace when no server is available, and the dialog shows a `Semantic`/`Text` badge. New `lsp/applyEdit.ts` workspace-edit applier, covered by unit tests.

### Changed
- **Sidebar rail** — the separate "Processes" and "Agent Queue" entries are replaced by a single "Activity" item. The `processes` and `agent-queue` views both render the unified panel, so saved layouts keep working.

### Docs
- **ROADMAP corrections** — the Shipped "AI-powered rename … with AI verification" line was inaccurate (the shipped rename was a regex word-boundary find/replace, with no AI); it now describes the LSP-backed rename with text fallback. The multiplayer-terminal item now describes the shipped SSE transport accurately instead of "polling". The background-job item is marked shipped, and the LSP refactoring item is narrowed to the remaining extract-function / inline-variable work.

## [1.16.0] — 2026-06-10

Editor linting reaches the C-family languages, plus file-tree and fold-placeholder polish.

### Added
- **Java and C/C++ syntax linting** — C, C++, and Java move off the legacy `clike` StreamParser modes onto proper Lezer grammars (`@codemirror/lang-cpp`, `@codemirror/lang-java`), so they now surface real-time syntax-error markers like the other Lezer-backed languages. A new `syntaxErrorRanges` helper expands zero-width error nodes (an expected-but-missing closing delimiter reports as a zero-width node) to a 1-char range, so missing-brace warnings actually render instead of being invisible. Covered by a new `linting.test.ts` (18 tests).
- **Bracket-balance linter for StreamParser languages** — languages without a Lezer grammar produce no error nodes, so they now get a `delimiterLinter` bracket-balance check for the extensions where brackets are reliably balanced.
- **C# language server config** — `csharp-ls` (Roslyn-based, `dotnet tool install --global csharp-ls`) wired into the LSP server registry for `.cs` files.
- **More folder icons** — `mobile`, `systems`, `query`, `functional`, `jvm`, `devops`, and `dotnet` folder names now resolve to catppuccin folder glyphs (android, core, database, functions, gradle, workflows, and lib respectively) instead of the plain default folder.

### Fixed
- **Fold-placeholder pill now follows the theme** — the inline `…` shown in place of folded code used CodeMirror's hardcoded light-gray base-theme box, which clashed with every dark theme. It's now styled from the active theme's CSS variables (translucent fill/border off `--foreground`, `--muted-foreground` text, hover brighten) so it adapts per theme across the editor, git-diff, and AI-diff panes.

## [1.15.15] — 2026-06-10

Code-quality cleanups — no behavior change.

### Changed
- **De-duplicated `display_path`** — the byte-identical helper in `fs/search.rs` and `fs/grep.rs` is hoisted to `fs/mod.rs` and shared.
- **`percent_encode_path` no longer allocates per byte** — `lsp/session.rs` built a temporary `String` and `Vec<char>` for every encoded byte inside a `flat_map`; it now writes directly into a single output `String`.

(The third flagged dedup, `write_if_changed`, was intentionally left as-is: hoisting it out of the two `#[cfg]`-gated `shell_init` submodules cascades into platform-specific import cleanup that's only verifiable on CI's Unix runners — more risk than a stable 15-line helper's duplication is worth.)

## [1.15.14] — 2026-06-09

Correctness + code-quality cleanups from the v1.15.13 review — the low-risk subset.

### Fixed
- **Git output silently dropped on non-UTF-8 bytes** — five `from_utf8(...).unwrap_or("")` sites in `git/operations.rs` (status / log / diff-tree parsers) returned *empty* on a single invalid UTF-8 byte (e.g. a Latin-1 path), losing the whole parse — the pitfall-#13 failure mode. Four now use `from_utf8_lossy`; `split_name_status_numstat` was rewritten to operate on raw bytes so a non-UTF-8 path can't desync the split offset or panic.
- **Editor breakpoint sync ran on every render** — `EditorPane` derived breakpoints via `breakpointsForPath()`, which returns a fresh array each call, so the gutter-sync effect fired on every keystroke. It now selects the stable store array and derives the per-path lines in a `useMemo`.
- **`useFileTree.dirname` mishandled Windows drive roots** — it lacked the pitfall-#12 handling (`C:/file` → `C:` instead of `C:/`), unlike `lib/path.ts`. Added separator normalization + drive-root handling.

### Changed
- **`AgentSwitcher` reads the agent list reactively** — replaced a `useAgentsStore.getState().all()` snapshot + a `void customAgents` subscription-keepalive hack with a `useMemo` keyed on the subscribed `customAgents`.

## [1.15.13] — 2026-06-09

Bugfix sweep.

### Security
- **Git worktree commands now enforce workspace authorization** — `git_worktree_list/add/remove/prune` bypassed the `WorkspaceRegistry` authorization that all 20+ other git commands run through, so a compromised renderer or plugin could operate on git worktrees of an arbitrary repo *outside* the authorized workspace (including `worktree add` writing to an arbitrary path and `worktree remove --force`). All four now call `authorized_repo_root` first, matching every sibling command.

### Fixed
- **LSP/DAP unbounded `Content-Length` allocation** — the JSON-RPC reader loops allocated `vec![0u8; len]` straight from the subprocess's `Content-Length` header with no upper bound, so a malformed or hostile language server / debug adapter could force a multi-GB allocation (OOM → abort under `panic = "abort"`). Both are now capped at 64 MiB.
- **Git availability cache: stray panic on a poisoned lock** — one of the two `availability_cell().lock()` sites in `git/process.rs` still used `.expect()` (it had dodged the earlier sweep due to indentation); it now recovers from poison like its sibling.
- **Two Rules-of-Hooks violations** — `AiChat`'s `RenderedMessage` called `useMemo` *after* an early `return` for user messages, and `WorkspaceEnvSelector` called five store hooks after a `return null` platform guard. Both are safe today only because the branch condition is fixed per component instance, but they are latent crashes (and lint violations); the hooks now run unconditionally before the early return.

## [1.15.12] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **AI HTTP egress front-door fuzz** — `net.rs` gains two property tests completing the egress-security coverage (the `ip_kind` SSRF classifier was already fuzzed in 1.15.5): `validate_url` never panics and only accepts URLs with an http(s) scheme, no embedded userinfo, and a non-blocked host (50,000 random inputs); `sanitize_headers` never lets a blocklisted header or a value carrying CR/LF/NUL (the header-injection vector) through (30,000 random header maps).

## [1.15.11] — 2026-06-09

Supply-chain — clear the remaining advisories in the shipped dependency tree.

### Security
- **mermaid → 11.15.0 + uuid → 14.0.0** — added pnpm overrides in `pnpm-workspace.yaml` lifting the resolved `mermaid` floor to `>=11.14.1` (pulled in via `streamdown`), clearing the moderate HTML/CSS-injection and Gantt-chart infinite-loop DoS advisories, plus `uuid` to `>=11.1.1` (resolves to 14.0.0, which mermaid accepts) for GHSA-w5hq-g745-h8pq. `pnpm audit --prod` now reports zero advisories. The overrides live in `pnpm-workspace.yaml`, not `package.json` — pnpm 11 no longer reads a `pnpm.overrides` field from `package.json`.

## [1.15.10] — 2026-06-09

Reliability hardening (A5) — bound a network-facing buffer.

### Fixed
- **LAN share server: cap request header reads** — `http_share` read the HTTP request line and headers with unbounded `read_line()`, so a malicious client on the same network could exhaust the host's memory by sending an endless line or an unbounded header stream. The request reader is now bounded to 64 KiB via `Read::take`, after which parsing ends cleanly. (The SSE client list already self-prunes dead senders on each broadcast.)

## [1.15.9] — 2026-06-09

Reliability hardening (A1) — convert avoidable production panics to errors. Because the release profile is `panic = "abort"`, every reachable `.unwrap()`/`.expect()` is a potential whole-app abort.

### Changed
- **`git push` no longer relies on a distance-coupled `unwrap`** — `git/operations.rs` replaced `upstream.unwrap()` (sound only because of an `is_none()` early-return a dozen lines above) with a `let…else`, so the value can never panic-abort the app if that guard is ever moved or refactored.
- **Poison-resilient locks** — the git-availability cache (`git/process.rs`) and the grep results collector (`fs/grep.rs`) now recover from a poisoned lock instead of `.unwrap()`/`.expect()`-panicking, matching the established PTY/workspace pattern.
- **Secrets store (Linux)** — `with_store` returns an error on the (unreachable) empty-cache branch instead of `.expect()`-panicking.

### Notes
- The PTY reader/flusher/waiter thread-spawn sites (`pty/session.rs`) were intentionally left as `.expect()`: a correct conversion to error-returns must kill the just-spawned child shell on the failure path (the kill-guard is already disarmed by then), and that cleanup carries real risk in the delicate ConPTY lifecycle for an extremely rare (OS thread-exhaustion) failure that the crash reporter already captures.

## [1.15.8] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **AI tool-safety property/fuzz tests** — `security.test.ts` gains property tests over the path/command guards (`checkReadable`, `checkWritable`, `checkShellCommand`): on 20,000 random/adversarial inputs they never throw and always return a boolean `ok`; `checkWritable` is proven at least as strict as `checkReadable` (writes inherit every read denial); any path or command containing a control byte is always refused; and a file under `.ssh` is blocked regardless of case, path separator, drive prefix, or depth.

## [1.15.7] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **Shell session sentinel anti-spoof fuzz** — `shell/session.rs` gains a 50,000-iteration fuzz test for `strip_cwd_sentinel`, asserting its security guarantee: a working-directory update is extracted only when the exact random per-session sentinel is present, so untrusted command output (laced with foreign/partial sentinels, multibyte text, and control bytes) can never spoof a cwd change or alter the passed-through stdout — and never panics.

## [1.15.6] — 2026-06-09

Robustness + more bug-catching tests.

### Added
- **Git porcelain-v2 parser fuzz + edge tests** — `git/parser.rs` gains a 50,000-iteration fuzz test asserting the parser never panics on malformed, truncated, or non-ASCII `git status --porcelain=v2 -z` output (it consumes attacker-influenced branch names and file paths), plus regression cases for empty input and a rename record whose paired original-path token is missing.

### Changed
- **Workspace registry lock recovery** — `WorkspaceRegistry`'s `roots` and `canonical_cache` mutexes now recover from a poisoned lock (`unwrap_or_else(|e| e.into_inner())`) instead of `.expect()`-panicking, matching the pattern already used in the PTY subsystem. Poisoning can only occur under unwind (dev/test builds — release is `panic = "abort"`), but this stops a panic in one thread from cascading through the security-critical authorization path during development.

## [1.15.5] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **SSRF classifier fuzz + boundary tests** — `net.rs` gains a 1,000,000-iteration property test asserting the safety invariant of the `ip_kind` SSRF guard: an IPv4 in any reserved/internal range (RFC1918, CGNAT, link-local, loopback, broadcast, multicast, benchmarking) is never classified `Public`/fetchable. It cross-checks against std's own range predicates, so it's an independent oracle rather than a restatement of the implementation. Plus off-by-one boundary tests for the `172.16/12` and `100.64/10` ranges.

## [1.15.4] — 2026-06-09

CI and tooling hardening — no runtime changes.

### Changed
- **CI: macOS Rust job** — `cargo test` now also runs on `macos-latest`, the only job that compiles and exercises the apple-native keychain backend and the macOS window-controls path.
- **CI: production supply-chain gate** — the frontend job runs `pnpm audit --prod --audit-level high`, failing the build on a high/critical advisory in the *shipped* (runtime) dependency tree. Dev-tool advisories are excluded; moderate advisories remain tracked by the weekly `audit.yml` job.
- **Docs: pre-push checklist** — `CLAUDE.md` now lists every command CI gates on (`tsc --noEmit`, `cargo fmt --check`, `cargo clippy -- -D warnings`), with a note to run `fmt` last after any clippy fixes (the ordering that bit the 1.15.0 cycle).

## [1.15.3] — 2026-06-09

More bug-catching tests — no runtime changes.

### Added
- **Sandbox prefix-matching tests for the workspace authorization guard** — `workspace.rs` gains a pure (filesystem-free) test module for `WorkspaceRegistry::is_authorized`, the component-prefix check at the heart of the spawn sandbox. Includes a regression test that a sibling sharing only a *string* prefix with an authorized root (e.g. `/ws/project-evil` vs root `/ws/project`) is rejected — the classic sandbox escape a switch from `Path::starts_with` to `str::starts_with` would silently reintroduce — plus a 5,000-iteration fuzz cross-check against an independent component-prefix reference.

## [1.15.2] — 2026-06-09

Reliability hardening — no user-facing UI changes yet.

### Added
- **Crash reporter** — a global panic hook writes a structured report (app version, thread, panic location, message, and backtrace) to `{cache}/nexis/crash/` before the process exits. Because the release profile uses `panic = "abort"`, a panic on any thread previously vanished with no trace; it now leaves a diagnosable report on disk. A new `list_crash_reports` command (capped at 10 reports, 64 KB each) lets the UI surface a "Nexis recovered from a crash" notice on the next launch.

### Fixed
- **`get_launch_dir` no longer panics on a poisoned mutex** — it recovers the inner value via `unwrap_or_else(|e| e.into_inner())` instead, so a poisoned `LaunchDir` lock can't abort the whole app under `panic = "abort"`.

## [1.15.1] — 2026-06-09

CI and test hardening — no user-facing changes.

### Changed
- **CI now typechecks** — the `test-frontend` job runs `tsc --noEmit` before Vitest. A type error that doesn't happen to break a test can no longer pass CI green (the job previously ran only `pnpm test`).

### Added
- **Fuzz-lite property tests for the DA (Device Attributes) filter** — `da_filter.rs` gains a dependency-free 20k-iteration property test asserting the invariants that matter for an untrusted-byte parser: chunk-boundary invariance (splitting the stream anywhere yields identical output and replies), no byte synthesis (`out` is always an in-order subsequence of the input and never longer), and that every emitted reply is exactly one of the two canonical DA answers. Plus regression cases for a trailing ESC and SGR sequences.

## [1.15.0] — 2026-06-08

A focused polish pass — no new features and no breaking changes. Implements P1–P7 from the June 2026 UI critique (`UI_IMPROVEMENTS.md`) plus a Rust lint/format cleanup.

### Added
- **Brand accent color** — new `--brand` / `--brand-foreground` CSS variables (coral `oklch(0.72 0.15 35)`) defined in `globals.css` and wired into the Tailwind theme. Applied to the welcome-screen CTA button and the zoom-slider range track so the accent is consistent instead of hardcoded per component.
- **Welcome screen AI entry point** — the shortcut grid's first action is now **Open AI agent** (`Ctrl+I`) instead of a duplicate "New terminal", and the subtitle surfaces the AI agent in one line.

### Changed
- **Sidebar overflow menu** — the overflow popover is restructured into five named, labeled groups (Navigation / Code / AI / Dev Tools / Advanced), replacing the flat 20-item PINNED / MORE split. Pin/unpin toggles and top-to-bottom keyboard navigation are preserved.
- **Shortcuts modal key badges** — every key token now renders as a pill badge, including punctuation (`,` `` ` `` `]`). "Jump to tab 1–9" reads as two distinct badges with a dash separator rather than one elongated pill.
- **Section header weight** — settings and shortcuts-modal section headers upgraded to `text-xs font-semibold text-foreground/70`, making them clearly distinct from body copy.
- **Settings modal scroll affordance** — a bottom fade overlay appears when the active tab's content overflows and disappears once scrolled to the bottom, making the cut-off Terminal section discoverable.
- **Terminal recording dot** — the recording toggle gains a `hover:bg-muted` boundary so it reads as a clickable target in its resting state.

### Fixed
- **Undo/redo in the shortcuts list** — `editor.undo` and `editor.redo` are marked `displayOnly` (they are handled by CodeMirror's history keymap and cannot be remapped via the global shortcut system), matching their code comment.
- **Settings scroll fade on reopen** — the scroll-reset effect now keys off the dialog open state, so reopening on the same tab clears the stale "scrolled to bottom" flag and the fade shows correctly.
- **Welcome-screen CTA hover** — brand button hover opacity normalized to `/80` to match the default button variant.

### Internal
- **CI** — added Dependabot, a Rust lint job (`cargo fmt --check` + `cargo clippy -D warnings`), and a weekly `cargo audit`.
- **Rust cleanup** — applied `cargo fmt` across all source files and resolved every `clippy -D warnings` violation (a `PendingMap` type alias for the DAP/LSP pending-request maps, `next_back()` over `.last()`, and a stray doc comment).

## [1.14.0] — 2026-06-07

### Added
- **Expanded syntax highlighting** — CodeMirror language packs for 15 additional languages, with per-file header blocks added across the source tree and GitHub issue/PR templates.

## [1.13.0] — 2026-06-01

### Added
- **OSC 0/2 tab titles** — terminal programs can set the tab title via escape sequences.
- **Cursor preferences** — configurable cursor style and blink rate.
- **Debugger sidebar panel + pinnable rail** — the DAP debugger gets a dedicated sidebar panel, and sidebar-rail items can be pinned.

### Fixed
- **Render-crash error boundary** — a React error boundary renders a recoverable fallback instead of a blank window on a render crash.
- **PowerShell tab title** — corrected PowerShell tab-title handling.

## [1.12.0] — 2026-05-31

### Added
- **E2E harness** — a WebdriverIO end-to-end harness, plus expanded Rust and Vitest unit coverage.
- **Release automation** — the release workflow builds the Windows NSIS/MSI installer on a `v*` tag push.

### Fixed
- Assorted bug fixes surfaced by the new test coverage.

## [1.11.0] — 2026-05-31

### Added
- **AI explain commit** — an "Explain" button in the git-history commit-detail popover loads the full diff and sends it to the AI panel with author/SHA context.
- **Shell command snippets** — a sidebar panel for saving and running frequently-used shell commands; one-click sends to the active terminal, with `{VAR}` placeholder support and five built-in starters.

## [1.10.0] — 2026-05-31

### Added
- **Workspace notes** — a per-workspace Markdown scratch-pad saved to `.nexis/NOTES.md`; auto-saves on keystroke, with a live-preview toggle, accessible from the sidebar.
- **Git worktrees** — list, add, and remove git worktrees from the source-control panel; clicking a worktree switches the workspace; supports a branch-creation flag and prune.

## [1.9.0] — 2026-05-31

### Added
- **Live terminal streaming** — the LAN share server gained Server-Sent Events; the browser page auto-updates every 2 s with current terminal output via a `/stream` SSE endpoint, for real-time viewing on any device on the same network.
- **Prompt templates** — reusable named AI prompts stored in localStorage; one-click sends any template to the AI panel; create/edit/delete from the sidebar, with four built-in starters.
- **File bookmarks** — bookmark any file or line with `Alt+D`; a persistent, keyboard-navigable sidebar panel grouped by file, with inline label editing, backed by localStorage.

## [1.8.0] — 2026-05-31

### Added
- **Semantic / AST-aware search** — a structural symbol-search panel with pattern prefixes (`fn:` `class:` `hook:` `import:` `type:` `const:`) that translate to language-aware regexes fed to the existing grep backend.
- **Remote Prompt viewing** — a local stdlib-only TCP HTTP server serves the current AI conversation as a self-contained HTML page accessible from any device on the same LAN; the same server also handles terminal snapshots.
- **AI refactoring engine** — a sidebar panel with Extract Function, Inline Variable, Add Types, Simplify, Add Error Handling, and Add Docs operations; `Alt+Shift+X` captures the active editor selection and prompts the AI with structured refactoring instructions.
- **Multi-window** — open Nexis in multiple independent windows via `Ctrl+Shift+N`; each window has its own workspace, tabs, and layout, sharing the OS keychain and theme.

## [1.7.0] — 2026-05-31

### Added
- **AI code review** — on-demand review of the staged or all-unstaged diff via a dedicated sidebar panel; shows file/line stats and a scrollable diff preview, and "Review with AI" sends the diff as a structured prompt.
- **AI-assisted git conflict resolution** — conflict files are surfaced automatically in the source-control panel; "Resolve with AI" reads the conflicted file and sends a structured three-way resolution prompt including conflict markers and context.
- **Background agent queue** — a sidebar panel for queuing multiple AI prompts to run sequentially; tasks show queued/running/done/failed status with duration, failed tasks can be retried, and there's a clear-completed action.

## [1.6.0] — 2026-05-31

### Added
- **Streaming build errors → AI** — a "Fix with AI" button appears in the Build panel when a build fails, sending the compiler output directly to the AI panel as a pre-filled prompt.
- **Workspace profiles** — named configurations storing a root path, env-var overrides, and an optional startup command (saved to localStorage); a sidebar panel with full CRUD, where activating a profile switches workspace, applies env vars, and optionally runs the startup command.
- **Embedded REPL panel** — an interactive Python, Node.js, Ruby, or shell REPL in the sidebar via a dedicated TerminalPane; `Alt+Shift+R` sends the active editor or terminal selection directly into the running REPL.

## [1.5.0] — 2026-05-31

### Added
- **Terminal session recording** — record PTY output to an asciinema v2 `.cast` file with a single toggle button, saved to `~/nexis-recordings/`; useful for demos and bug reports.
- **Port forwarding panel** — a dedicated sidebar panel that detects locally listening TCP ports via `ss`/`lsof`/`netstat`, with one-click open-in-preview for web/dev-server ports and a 5 s auto-refresh.
- **SSH key manager** — a collapsible section in the SSH panel listing `~/.ssh/*.pub` keys; generate new Ed25519 key pairs via `ssh-keygen` with an optional passphrase, and one-click copy of the public key.
- **Diffstat in commit view** — per-file +/− line counts in the git-history commit-detail view for every changed file.

## [1.4.0] — 2026-05-31

### Added
- **Workspace switcher** — a keyboard picker (Ctrl + backtick) for recently opened folders with fuzzy search; switching resets the workspace and starts a fresh terminal at the selected directory, and the recent list persists across restarts.
- **Persistent AI chat history** — a searchable session-history popover in the AI panel header; sessions sorted by last-updated, filterable by title, with compact timestamps, backed by the Tauri store across restarts.
- **Git submodule support** — a collapsible submodule list in the source-control panel with status badges (ok / modified / uninitialized / conflict), short SHA, path display, and per-entry init/update actions.

## [1.3.0] — 2026-05-30

### Added
- **Git stash manager** — list, create, apply, pop, and drop stashes from the source-control panel; a collapsible stash list with message, timestamp, and per-entry actions.
- **AI inline explain** — select any terminal output or code and click "Explain" to submit an explanation request to the AI mini-window instantly, no full panel required.
- **Terminal → AI** — "Explain" and "Ask Nexis" buttons appear on text selection in the terminal or editor; the selection is attached as context and the AI responds in the mini-window.

## [1.2.0] — 2026-05-30

### Added
- **Image viewer** — open PNG, JPG, GIF, WebP, SVG, BMP, ICO, AVIF, and TIFF files directly in a new tab. Supports fit-to-window mode, zoom in/out (scroll wheel or toolbar), pixel-perfect rendering at high zoom, fullscreen toggle, and animated GIF/WebP playback pause during window resize or when the tab is hidden.
- **Tab drag-to-reorder** — drag any tab left or right to reorder the tab strip. Chrome-style live preview: the tab slides to its new position in real-time as you drag. Grab cursor on hover, grabbing cursor during drag.
- **Custom cursor set (Tailless Smooth)** — app-wide custom cursors using the Tailless Smooth set. All 29 cursor states are covered (arrow, pointer, text, resize handles, grab/grabbing, crosshair, wait, not-allowed, zoom, and more). Hotspot coordinates read directly from the original `.cur` file headers.
- **Source Control panel icon** — replaced the animated folder in the "No repository" empty state with a static `FolderGitTwo` icon for a cleaner look.

### Changed
- **Welcome screen** — replaced the animated folder with the Nexis logo PNG backed by a theme-colored radial glow. DarkVeil background tuned (speed `0.4 → 0.3`, noise `0.025 → 0.04`). Added a gradient horizontal rule between the CTA and shortcuts grid. `<kbd>` chips now have an inset bevel shadow for a keycap feel.
- **Tab bar** — active tab now shows a 1.5 px primary-color accent line along the top edge.
- **Sidebar rail** — active view indicator changed from a bottom underline to a left-edge 2 px line (matching VS Code / Fleet style).
- **Panel headers** — subtle `primary/4%` gradient sweep on the header row of Recent Files, Snippets, Database, and Source Control panels.
- **Status bar** — hard `border-t` replaced with a soft gradient line that fades at the edges.
- **Scrollbars** — added `.nexis-scrollbar` utility (3 px, semi-transparent thumb) applied to sidebar panel list containers.
- **Empty states** — Snippets panel now shows a `FileCode` icon above the "No snippets yet" text; Database panel icon normalized to size 28 / `30%` opacity to match Source Control and Snippets.

### Fixed
- **Tab reorder via HTML5 drag API** — replaced with mouse-event-based drag (pointerdown → global mousemove/mouseup) to avoid conflicts with Tauri's `data-tauri-drag-region` intercepting drag events on the tab bar container.

---

## [1.1.0] — 2026-05-29

### Added
- **Recent Files panel** — new **Recent Files** entry in the sidebar rail (clock icon, second position after Files). Tracks every file you open through the explorer or that the AI agent writes/edits, persisted across sessions via localStorage (up to 50 entries). Displays filename, directory path, and a relative timestamp ("just now", "3m ago", "2d ago"). Hover any row to reveal a remove button; **Clear** in the panel header wipes the whole list.
- **Fuzzy search on Recent Files** — a filter input appears in the panel whenever the list is non-empty. Matches against the filename (higher weight) and directory path simultaneously, ranks results by consecutive-character runs and proximity to the start of the name, and highlights matching characters inline. Keyboard-navigable: `↓ / ↑` moves the selection, `Enter` opens the file, `Escape` clears the query. Mouse hover and keyboard selection stay in sync.
- **AI-edit tracking in Recent Files** — files written by the AI agent via `edit`, `write_file`, and `multi_edit` tools are automatically pushed to the Recent Files list via the `fs:file-written` event, without any manual action needed.
- **AI mini-window input bar** — the floating AI popup now contains a full text input bar (same `AiInputBar` component as the docked panel). Typing in the mini-window works identically to the main panel; picking a quick-action suggestion pre-fills the input instead of jumping away to the full panel.
- **AI mini-window logo** — Nexis logo displayed at the top of the mini-window popup.

### Fixed
- **App reset to welcome page after AI file edits** — when the AI agent wrote a file and the only open tab was a transient `ai-diff` or `git-diff` tab, `saveTabState` serialized an empty tab list and overwrote the previously-saved terminal/editor tabs in localStorage. On next reload the app found no tabs and showed the welcome page. Fixed by skipping the save when the serialized list would be empty but in-memory tabs still exist.

---

## [1.0.0] — 2026-05-27

This is the first stable release of Nexis. The milestone closes out the initial feature roadmap with release tooling and represents the full pre-1.0 feature set built across the 0.x series.

### Added
- **Release tooling panel** — a dedicated **Release** panel in the sidebar surfaces everything needed to ship: current version from `package.json`, the last git tag, all commits since that tag formatted as a conventional changelog entry, one-click copy to clipboard, and buttons to create a git tag for patch/minor/major bumps directly from the UI.
- **AI skill bundles** — the agent skill system is now extensible. Skill bundles are composable packages of slash commands and agent tools; the foundation for community-installable bundles is in place.

### What's in 1.0

Over the 0.x series, Nexis shipped: multi-tab PTY terminal, CodeMirror 6 editor with AI autocomplete, AI agent panel with 12+ providers (including offline via LM Studio/MLX/Ollama and Hugging Face hosted models), source control, git history, test runner, build system, database panel, SSH connection manager, Jupyter notebook viewer, Python environment awareness, Docker/devcontainer detection, workspace-wide symbol rename, code minimap, snippet library, find-and-replace, command palette, symbol outline, breadcrumb navigation, background process manager, keybinding editor, markdown preview, code formatter, run-file integration, drag-to-float AI panel, notifications center, and more.

No accounts. No telemetry. BYOK or fully offline.

---

## [0.9.15] — 2026-05-27

### Added
- **Jupyter notebook viewer** — right-click any `.ipynb` file in the explorer and select **Open Notebook** to view it in a dedicated tab. Code cells render with syntax-aware styling and execution count labels; markdown cells render as formatted text; stream and error outputs are shown below each code cell with ANSI escape stripping. Static read-only view (no kernel required).

---

## [0.9.14] — 2026-05-27

### Added
- **Container-aware environments** — Nexis now detects Docker and devcontainer configurations in the workspace root (`.devcontainer/devcontainer.json`, `docker-compose.yml`, `Dockerfile`, etc.) and surfaces a **Container** pill in the status bar. The pill shows the detected type (Dev Container, Docker Compose, or Dockerfile) with a tooltip. Detection is automatic and re-runs when the workspace changes.

---

## [0.9.13] — 2026-05-27

### Added
- **SSH connection manager** — a dedicated SSH panel in the sidebar lets you save, edit, and delete SSH connections (host, port, user, identity file). Click **Connect** on any saved connection to open it in a new terminal tab with the correct `ssh` command pre-entered and executed. Connections persist across sessions via the Tauri store.
- **Code minimap** — the editor now shows a 52 px minimap panel alongside the code. Each line is rendered as a thin strip colored by content type (comments vs. code). Click or drag anywhere on the minimap to jump to that position; a viewport indicator shows your current scroll location.

---

## [0.9.12] — 2026-05-27

### Added
- **Workspace-wide symbol rename** — press **F2** on any identifier in the editor to rename it across all files in the workspace. A dialog shows the symbol, a count of occurrences by file, and an input for the new name. Pressing Enter or clicking Rename applies word-boundary-aware replacement to every matching file simultaneously and reloads the editor. Supports any text file; uses the same fast native grep engine as the AI tools.

---

## [0.9.11] — 2026-05-27

### Added
- **Hugging Face integration** — Hugging Face is now a first-class AI provider. Add your HF access token in Settings → AI and choose from five pre-configured hosted models: Llama 3.1 70B, Llama 3.1 8B, Qwen 2.5 Coder 32B, Phi-4, and Mistral 7B. All models run through the HF Inference API and work in the AI panel, autocomplete, and any other model-using feature.

---

## [0.9.10] — 2026-05-27

### Added
- **Integrated build system** — new **Build** tab in the sidebar. Auto-detects your build tool from the workspace root (pnpm, Cargo, Make, Gradle, Maven, CMake, Go, Python). Enter any custom command or use the detected one. Click **Build** (or press Enter) to run; live output streams into the panel. Stop the build at any time. Success/failure status is parsed from the output and shown with a summary line.

---

## [0.9.9] — 2026-05-27

### Added
- **Database panel** — new **Database** tab in the sidebar. Connect to SQLite, PostgreSQL, and MySQL databases. Browse tables with the schema browser; click a table chip to instantly run a `SELECT * … LIMIT 100` query. Write and run arbitrary SQL in the built-in query editor (Ctrl+Enter to run). Results render in a scrollable table with a sticky header. Connections persist across sessions.

---

## [0.9.8] — 2026-05-27

### Added
- **Live file system sync** — the file explorer now auto-refreshes every 3 seconds when the app is focused and the window is visible. Files created, renamed, or deleted by terminal commands or external tools appear immediately without requiring a manual refresh click.
- **Test runner panel** — new **Tests** tab in the sidebar. Auto-detects the test framework from your workspace (Vitest, Jest, Cargo Test, pytest, Go Test, Gradle). Run tests with one click; live output streams into the panel as the suite runs. Stop the run at any time. Test results show pass/fail status with a summary line parsed from the test output.

---

## [0.9.7] — 2026-05-27

### Added
- **AI PR description generation** — **Generate PR Description** button in the Source Control panel opens a dialog that reads the last 20 commits and uses AI to draft a pull request title and Markdown body. The title and body are independently editable before copying. Powered by the same model selected for the AI panel.

---

## [0.9.6] — 2026-05-27

### Added
- **Snippets library** — new **Snippets** tab in the sidebar rail. Create, edit, and delete code snippets with tab-stop placeholders (`$1`, `$2`, …, `$0` for final cursor position), scoped by language. Built-in starter snippets for TypeScript, Python, Rust, and Go. Trigger any snippet in the editor by typing its prefix then pressing **Tab** — the prefix is replaced with the snippet body and the cursor is placed at the first tab stop. Snippets persist across sessions via a local store.

---

## [0.9.5] — 2026-05-27

### Added
- **Breadcrumb navigation** — the editor toolbar now shows the file's path relative to the workspace root as a row of clickable segments. Clicking any folder segment switches the sidebar to the file explorer. The final segment (filename) is styled differently and non-interactive.
- **Symbol outline panel** — new **Outline** tab in the sidebar rail shows a live, scrollable tree of symbols in the active file: functions, classes, interfaces, types, enums, and methods. Symbols are extracted via language-aware regex patterns covering TypeScript/JavaScript, Python, Rust, and Go. Each entry shows the symbol kind (with a color-coded icon), name, and line number.

---

## [0.9.4] — 2026-05-27

### Added
- **Command palette** — `Ctrl+Shift+P` (`Cmd+Shift+P`) opens a fuzzy-searchable overlay of every app action: open settings, toggle panels, new tab, split panes, change sidebar view, toggle the AI panel, zoom controls, and more. Built on `cmdk` for instant keyboard-driven filtering. Commands are grouped by category and navigable with arrow keys; Enter executes, Escape dismisses.

---

## [0.9.3] — 2026-05-27

### Added
- **Find & replace across project** — `Ctrl+Shift+H` (`Cmd+Shift+H`) opens a workspace search overlay. Supports plain text and regex search, case sensitivity toggle, and per-file match preview with syntax-highlighted match regions. **Replace all** reads every matching file, applies the replacement, and writes it back — with a confirmation count on completion. Results show file name, relative path, and each match line with its line number. Shortcut also appears in the keyboard shortcuts dialog.

---

## [0.9.2] — 2026-05-27

### Added
- **Background process manager** — new **Processes** panel in the sidebar shows every `bash_background` process with its command, working directory, start time, and live status (running / exited + exit code). Kill any running process with one click. Badge on the rail shows the count of running processes at a glance.
- **Notifications center** — bell icon in the status bar tracks in-app events (AI completions, errors, background process events). Unread count badge clears on open; individual notifications can be dismissed or bulk-cleared.

---

## [0.9.1] — 2026-05-27

### Added
- **Word wrap toggle** — wrap long lines at the viewport edge instead of scrolling horizontally. Toggle with the **Wrap** button in the editor toolbar or set it permanently in Settings → General → Editor. Persisted across sessions and synced across windows.
- **Code folding improvements** — fold all regions in the active file with `Ctrl+K Ctrl+0` (`Cmd+K Cmd+0` on macOS); unfold all with `Ctrl+K Ctrl+J`. Region comment folding now collapses `// #region` … `// #endregion` blocks (VS Code–compatible syntax) without any extra toolchain.

---

## [0.8.3] — 2026-05-25

### Added
- **Code formatting** — per-language formatter integration triggered from the editor (`Shift+Alt+F`) or automatically on save. Supports Prettier (JS/TS/CSS/HTML/JSON/Markdown), rustfmt, clang-format (C/C++), black (Python), and gofmt (Go). All commands use a `{file}` placeholder and run in the file's directory.
- **Settings → Formatters tab** — enable/disable per language, edit the formatter command, and reset to default. "Format on save" toggle applies the configured formatter after every Ctrl+S save.

### Changed
- **Settings is now an in-app modal dialog** — replaces the separate OS window. Opens centered over the app with a blurred backdrop at 920 × 700 px. Closes on Escape or ×. All existing shortcuts and `openSettingsWindow("tab")` deep-links continue to work.

---

## [0.8.1] — 2026-05-24

### Fixed
- **Terminal keyboard input on fresh launch** — typing in a new terminal tab immediately after launch was silently dropped until the PTY IPC channel was fully ready. Writes are now queued and flushed once the session is open.

---

## [0.8.0] — 2026-05-24

### Added
- **Inline linting and diagnostics** — real-time syntax error markers in the editor gutter via `@codemirror/lint`. Lezer parser errors surface for JS/TS, Python, Rust, Go, JSON, HTML, CSS, and Markdown with zero external toolchain required.

---

## [0.7.6] — 2026-05-24

### Fixed
- **Explorer rename failure is now visible** — `fs_rename` errors were silently swallowed; the user now sees an alert describing what went wrong instead of the rename silently reverting.
- **Explorer delete failure is now visible** — `fs_delete` errors were silently swallowed; the user now sees an alert instead of the file appearing to still exist.
- **Shell history overlay load error** — `read_shell_history` failures were silently caught and left the overlay showing "No shell history found" with no indication of the real problem. The overlay now shows "Could not load shell history" when the invoke fails.
- **Autostart toggle failure is now visible** — enabling/disabling launch-at-login could fail silently (e.g. missing OS permission); the user now sees an alert explaining the failure instead of the toggle appearing to have worked.
- **File attach skips binary/oversized files visibly** — attaching a binary or oversized file to an AI message silently discarded it; the user now sees an alert naming the file and the reason it was skipped.
- **Whisper mic/transcription errors surfaced** — microphone access denial and Whisper API failures were only logged to the console; the user now sees an actionable alert ("Microphone access denied — allow access in system settings" / "Transcription failed — check your OpenAI key and try again").
- **Reveal in file manager failure is now visible** — `revealItemInDir` failures were silently logged; the user now sees an alert when the OS can't reveal the file.

## [0.7.5] — 2026-05-23

### Fixed
- **Installer context-menu entries** — Windows right-click "Open in …" registry entries (for folders, folder backgrounds, and drives) still referenced the old "Terax" app name and executable. Updated `installer-hooks.nsh` to write and clean up `OpenInNexis` keys pointing to `nexis.exe`.

## [0.7.4] — 2026-05-23

### Fixed

**Rust backend**
- **PTY thread panic propagation** — All `.lock().unwrap()` calls on the shared `pending` mutex in `session.rs` (reader, flusher, waiter threads) now use `.unwrap_or_else(|e| e.into_inner())`. A panic in one thread no longer poisons the mutex and silently kills output in all other threads.
- **`pty_close` killer-lock panic** — `s.killer.lock().unwrap()` in `pty_close` replaced with `if let Ok(mut k) = s.killer.lock()`. A poisoned killer mutex (child process had already crashed) no longer panics the Tauri worker thread.
- **`pty_close` thread-spawn panic** — `thread::spawn(...).expect("spawn pty drop thread")` replaced with `.map_err(...)? `. Out-of-memory or thread-limit conditions now return an error to the frontend instead of aborting the process.
- **Git stdout silent UTF-8 data loss** — `git_stdout_line_opt` and `git_stdout_lines` in `process.rs` used `std::str::from_utf8(&output.stdout).unwrap_or("")`, which discards all output on invalid UTF-8 (e.g. Latin-1 encoded commit messages, binary filenames). Changed to `String::from_utf8_lossy(...)` to replace invalid bytes with `U+FFFD` instead of returning empty results.

**TypeScript / Frontend**
- **Shell agent session permanently broken after open failure** — `getSessionShell()` in `tools/shell.ts` cached rejected promises in `sessionShells`. If `shellSessionOpen` failed, every subsequent `bash_run` in that session re-threw the original error forever. The promise's `.catch()` handler now deletes the map entry before re-throwing, so the next call retries cleanly.
- **`approxBytes` throws on circular tool output** — `JSON.stringify(part.output)` in `compact.ts` throws a `TypeError` on circular object references. Replaced with a `safeJsonLength()` wrapper that catches the exception and returns a conservative estimate, preventing context compaction from crashing mid-conversation.
- **`dirname()` wrong result for Windows drive roots** — `dirname("C:/file.txt")` returned `"C:"` instead of `"C:/"`, breaking any path-based git or navigation operation for files at the drive root. Fixed by special-casing `idx === 2 && path[1] === ':'` to preserve the trailing slash. Also fixed `idx === 0` to return `"/"` (Unix root) instead of the full path.

## [0.7.3] — 2026-05-22

### Added
- **Theme editor** — Create/Edit buttons in Settings → Themes now open the `.nexis-theme` file in the code editor. Create generates a starter theme, saves it to custom themes, and opens it for editing. Edit opens the existing file. Main-window listener for `nexis://theme-edit` wired up in `App.tsx`.
- **Installer logo** — Nexis logo added as the Windows installer header image.

### Fixed
- Theme editor Create/Edit buttons were visually present but did nothing — the `nexis://theme-edit` event had no listener in the main window.

## [0.7.2] — 2026-05-22

### Added
- **Custom themes** — create, import, and delete `.nexis-theme` files from Settings → Themes. Swatch grid with live color previews.
- **Background images** — set a custom background image with adjustable opacity (0–100%) and blur (0–64px) in Settings → Themes. Stored locally; no cloud dependency.
- **Theme system foundation** — modular architecture: `types`, `validateTheme`, `themeFiles`, `customThemes`, `applyTheme`, `bgImageStore`, `SurfaceLayer`. Cross-window theme-change sync via `nexis://prefs-changed`.
- **Background preference store** — `backgroundKind`, `backgroundImageId`, `backgroundOpacity`, `backgroundBlur` added to preferences with full cross-window propagation.

### Changed
- Terminal renderer pool and `TerminalPane` updates.
- Settings layout and section polish (Agents, General, Themes sections).
- Style token and global CSS improvements.
- Workspace module updated in Rust backend.

## [0.7.1] — 2026-05-22

### Added
- **Shell history search** — Ctrl+R now opens a fuzzy, keyboard-navigable overlay sourced from your shell history (`~/.zsh_history`, `~/.bash_history`, fish history, PowerShell history). Arrow keys to navigate, Enter to insert, Escape to dismiss.
- **Terminal color themes** — built-in ANSI palette switcher in Settings → General: Default Dark, Catppuccin Mocha, Dracula, Nord, Solarized Dark, One Dark. Swaps hot without restart.
- **Tab and layout persistence** — terminal tabs (with working directory) and editor tabs are saved on change and restored on next launch. Toggle in Settings → General → Startup. Off by default clears saved state immediately.
- **Quick file open (Cmd+P / Ctrl+P)** — fuzzy workspace file picker. Respects `.gitignore`. Opens selected file in a new editor tab.

### Fixed
- Settings window 1px DWM border on Windows 10 removed (matching the main window fix).
- Replaced Terax logo with the Nexis logo in About section.

## [0.7.0] — 2026

### Changed
- Rebranded from Terax to Nexis.
- New Nexis logo across all platforms.
- Updated all branding, storage keys, and event namespaces.

## [0.5.9] — 2026

### Added
- Window management for Linux.

### Changed
- Secrets (keyring) redesign.
- Auto updater stabilization.

## [0.5.8] — 2026

### Added
- Auto-updater wired into release builds.
- GitHub Actions workflow for cross-platform builds and releases.

### Fixed
- Linux window initialization issue on first launch.

### Changed
- CI: bumped Node and pnpm versions used in release pipeline.

## [0.5.7]

### Changed
- Default working directory for new sessions is now `$HOME`.
- Stabilized shell init scripts (zsh / bash / pwsh) — fewer edge cases on first prompt.

## [0.5.6]

### Changed
- Reduced app size and startup cost via lazy loading of editor/AI modules.

## [0.5.5]

### Added
- Demo assets and updated README screenshots.

### Changed
- Dependency version sweep.

## [0.5.4]

### Changed
- Combined snippets and commands into a single surface for a cleaner UX.

## [0.5.3]

### Changed
- UI polish across AI / agent views.

## [0.5.2]

### Changed
- AI mini-window UI/UX improvements.

## [0.5.1]

### Added
- Full agentic workflow: plans, sub-agents, tasks, project init.
- Improved shell tool for the agent.

## [0.4.7]

### Added
- Vim mode in the code editor.
- Keyboard navigation across the file explorer.

## [0.4.6]

### Changed
- Cleanup pass: dependencies, UI, icon set.

## [0.4.5]

### Changed
- Optimized PTY resizing, session lifecycle, and AI context handling.

## [0.4.4]

### Changed
- Agents UI/UX improvements.

## [0.4.3]

### Added
- Skills and multi-agent support.
- Settings UI improvements.

## [0.4.2]

### Changed
- AI autocomplete improvements (latency, accuracy).

## [0.4.1]

### Added
- Local LLM support via LM Studio.
- Groq and Cerebras providers.
- AI autocomplete in the code editor.

## [0.3.9]

### Added
- AI edit diffs — preview and approve agent edits before applying.

## [0.3.8]

### Added
- File search across the workspace.
- Separate editor tab type, decoupled from terminal tabs.

## [0.3.7]

### Added
- Web preview tab with auto-detection of local dev servers.

## [0.3.6]

### Added
- Autostart and window-state persistence.

### Changed
- Settings UI improvements.

## [0.3.5]

### Added
- Standalone settings window.

## [0.3.4]

### Added
- New AI mini-window.
- Text selection handling and session persistence.

## [0.3.1]

### Changed
- Internal refactor.

## [0.3.0]

### Added
- AI agents (initial implementation).
- Apache-2.0 license.

## [0.2.9]

### Added
- Tauri keyring integration — API keys now stored in the OS keychain.

### Changed
- Internal renaming pass.

## [0.2.8]

### Changed
- Icon set and theme refresh.

## [0.2.7]

### Added
- Context menu in the file explorer.

### Changed
- General refactor; editor improvements.

## [0.2.4]

### Fixed
- Various bug fixes.

## [0.2.3]

### Added
- File explorer (first version).
- Code editor based on CodeMirror 6.

## [0.2.1]

### Added
- Logging.

### Fixed
- Shell script handling and session edge cases.

## [0.2.0]

### Added
- AI side panel.
- Status bar.
- Keyboard shortcuts.

## [0.1.3]

### Added
- AI SDK and AI Elements integration.

## [0.1.2]

### Added
- New app logo.
- Configurable window size.

## [0.1.1]

### Changed
- Rendering and resize improvements.
- Header and tabs UI polish.

## [0.1.0]

### Changed
- New UI shell.
- Internal refactor; fixed render/resize race.

## [0.0.8]

### Added
- Multi-tab support.
- Basic layout UI.

## [0.0.7]

### Changed
- Switched icon library from Lucide to HugeIcons.

## [0.0.6]

### Added
- Custom font and theme.
- Tauri window management.

## [0.0.5]

### Added
- xterm.js WebGL renderer, search, and link plugins.

## [0.0.4]

### Added
- shadcn/ui component set and supporting deps.

## [0.0.3]

### Added
- Child process lifecycle handling.
- Per-session locking.

## [0.0.2]

### Added
- Initial Rust PTY backend with xterm.js in React (prototype).
