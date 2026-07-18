# Roadmap

Where Nexis is heading, what's already in, and what I'm deliberately not building.

This gets updated as things shift. Day-to-day tracking lives in [GitHub Issues](https://github.com/rwetz/Nexis/issues).

---

## The point of Nexis

A terminal that treats AI as a first-class citizen — not a chatbot glued to the side, but something woven into the actual workflow. Fast, small, cross-platform, no cloud lock-in. You bring your own keys or run local models entirely offline.

The non-negotiables: terminal correctness, PTY fidelity, under 10 MB, no telemetry.

## Hard limits (things that won't be built)

- **Not a VS Code replacement.** The goal is a focused terminal-first tool — not a feature-for-feature IDE clone.
- **Not a browser.** The preview pane exists for local dev servers only.
- **Not a document editor.** This is terminal-first.
- **Not a package manager UI.** Use `npm`, `cargo`, `pip` in the terminal like normal.
- **No accounts or telemetry.** Ever.
- **No extension marketplace.** Maybe narrow AI tool bundles someday, but not arbitrary plugins.
- **No bundled LLM inference.** Shipping a llama.cpp-class engine would blow the size budget. Local models are supported by shelling out to Ollama / LM Studio / MLX, not by embedding an inference engine.
- **No mobile (iOS/Android).** The app's shape — real shells, PTY, arbitrary filesystem access — doesn't map onto mobile sandboxes.

## Design principles

1. AI should feel native, not bolted on — agents, autocomplete, and voice are first-class features
2. Keep the binary small. Every dependency earns its place.
3. Terminal correctness comes first. TUI apps, PTY edge cases, true-color — all matter.
4. Same experience on macOS, Linux, Windows, and WSL. No platform gets left behind.
5. Safe by default — path guards, SSRF protection, IPC sandboxing, tool approval flows.

---

## Shipped

The complete, versioned history of every shipped feature lives in **[CHANGELOG.md](CHANGELOG.md)** — that is the canonical record. This roadmap deliberately tracks only what's planned or in progress; items are removed once they land and written up in the changelog instead.

---

## Up next

- [ ] **Expansion packs — core + opt-in feature surface** — the sidebar's ~24 panels split into a fixed core (terminal, editor, Files, Recent Files, Source Control, AI chat via API) plus toggleable packs (navigation-plus, code-tools, ai-extras, dev-tools, ml-lab, advanced). Enablement gating, not installation — nothing is downloaded except the future nexis-ml flow. Taxonomy and decisions in `docs/vault/decisions/expansion-packs.md`; taxonomy source of truth in `src/lib/packs.ts`.
  - [x] **V1 — end-to-end slice**: packs config in prefs (`enabledPacks`, cross-window sync), rail/panel/plugin gating, Settings → Features section, first-run preset picker (Bare-Bones / Standard / Everything)
  - [ ] **V2 — finish the gating mechanism**: migrate hardwired panels into the plugin registry one per PR as they're touched (Debugger/Database/Advanced group first — already lazy-loaded); needs a design pass first — `PanelContribution` has no icon/group/pack fields and the rail doesn't render registry panels yet. (Palette/keybinding/settings-row gating shipped — `packEnabled()` in `src/lib/packs.ts` is the predicate for any new gated surface, incl. V3's future install-flow settings.)
  - [ ] **V4 — polish, driven by real usage**: discoverability for Bare-Bones users; per-pack settings / simpler feature variants only if users ask (deliberately cut from V1). (The "enable this pack?" placeholder shipped; V3's pinned-checksum install flow shipped — decision in `docs/vault/decisions/nexis-ml-artifact-pinning.md`. Follow-up for nexis-ml-rs CI: publish `checksums.txt` per release so Nexis pins can be cross-checked against CI output.)
- [ ] **Persistent terminal sessions** — PTY sessions survive Nexis restarts; reconnect to a running shell without losing scrollback or process state; native implementation inspired by tmux session persistence but without the terminal multiplexer overhead. Two independently shippable milestones:
  - [x] ~~**Milestone A — scrollback continuity (no broker)**~~ — done (see CHANGELOG `[Unreleased]`).
  - **Milestone B — live process persistence (PTY broker)**: shells keep running while Nexis is closed. PTY ownership moves to the same `nexis` binary launched headless (`nexis --pty-broker` — no second binary), talked to over a named pipe (Windows) / Unix socket with a length-prefixed `open/write/resize/close/list/attach` protocol plus a streamed output channel and a capped ring buffer replayed on `attach`. Per-tab opt-in ("Keep alive after close") + global default; private tabs excluded; broker exits with its last session; user-only socket permissions + random token handshake. Windows carry-overs: the ConPTY lifecycle lock and `hide_console` discipline move into the broker; ConPTY handles can't cross processes, so the broker owns the full PTY lifecycle. Non-goals: no tmux-style server-side window management, no multi-client input, no reboot survival.
- [ ] **ML Lab follow-ups** — publish `nexis-ml` to PyPI (trusted-publisher setup on pypi.org — external, blocks the panel's Python-engine install button working from a cold machine); close the Rust-engine feature gaps (config-only today: no textgen/blank templates, no inference playground, no HTML report); image-template ONNX export. Design record and known limits in `ML_SUITE.md`; the nexis-ml-rs `checksums.txt` CI follow-up is tracked under expansion packs V4 above.
- [ ] **Custom AI tool authoring** — write and test new agent tools in TypeScript using the Plugin API; a first-party SDK with type definitions, a local test harness, and one-command installation into a workspace

---

## Later

- [ ] **Remote workspace** — browse, edit, and run code on remote machines entirely over SSH; the file explorer and editor work against the remote filesystem via SFTP while the terminal is already there; the goal is a seamless local feel with zero local clones required
- [ ] **Selective TS → Rust migration** — profile hot paths (terminal input dispatch, diff rendering, file-tree diffing), identify where a Rust implementation gives a measurable win, migrate incrementally without growing bundle size; Zed's SumTree (summary-carrying copy-on-write B+-tree, `sum_tree` crate in their repo — one tree answers offset→line, line→hunk, path→subtree-size without separate indexes) is the reference design if diff rendering or tree diffing is the target; don't build it until a benchmark says the naive version is the bottleneck
- [ ] **Multiplayer terminal input (authenticated)** — the 1.18.0 live view is deliberately read-only because the LAN share server has no auth; full multiplayer (remote viewers typing into the shared terminal) needs an auth story first — e.g. a per-session token in the share URL plus an input-consent toggle on the host

---

## Feature backlog — upstream terax adoption

Candidates from a survey of upstream terax-ai v0.6.4 → v0.8.5 (researched 2026-07-15; the full research notes — `TERAX_INSPIRATION.md`, `ZED_INSPIRATION.md`, `OPTIMIZATIONS.md`, `UI_IMPROVEMENTS.md`, `PLAN.md` — were consolidated into this file on 2026-07-17 and live in git history). A pool, not commitments — each is a product call. OSC 52 clipboard already landed from this list. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

- 🟠 **Block-mode terminal** — Warp-style command blocks as a layer over the existing renderer pool, *no renderer rewrite needed* (upstream disproved our 1.20.1 assumption): OSC 133 markers (already parsed for the exit gutter) drive per-command decorations; the full mode adds a custom input bar with OSC-133-gated stdin routing so vim/htop/sudo still work. Known limitations to inherit knowingly: block tabs are single-pane, and the mode depends on OSC 133 shell integration (which Nexis already injects). Suggested first slice: decorations + block navigation only — pure frontend over existing markers.
- 🟡 **Spaces — persisted tab groups** with drag-to-organize, above tabs; natural fit with the existing layout-persistence store.
- 🟡 **whisper.cpp speech-to-text** — fully offline voice input by shelling out to a user-installed binary (like Ollama/LM Studio — never embedded, per the size-budget hard limit); voice is OpenAI-only today.
- [x] ~~**MRU Ctrl+Tab switcher**~~ — done (see CHANGELOG `[Unreleased]`).
- [x] ~~**Confirm before closing a tab with a running process**~~ — done (see CHANGELOG `[Unreleased]`).
- [x] ~~**Zen mode**~~ — done (see CHANGELOG `[Unreleased]`).
- [x] ~~**Small settings wins**~~ — done: terminal font weight, default shell, editor language override, go-to-line, branch checkout all shipped (see CHANGELOG `[Unreleased]`).

---

## Hardening backlog

Reliability, security, and performance ideas tracked for the "bulletproof and solid" goal (migrated here from the former `IDEAS.md` brainstorm). These are a raw pool, not commitments. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

**Reliability & correctness**
- 🟡 Extend the panic-lint gate (`clippy::unwrap_used`/`expect_used`) from the security-critical command modules (net, secrets, recording) to the remaining `#[tauri::command]` modules, converting each production `unwrap`/`expect` to real error handling as it's enabled.
- [x] ~~PTY thread watchdog~~ — done, via thread-exit sentinels rather than heartbeats (a blocked-but-alive thread is healthy; only actual thread death is a stall — see CHANGELOG `[Unreleased]`).
- 🟡 Windows startup self-test for the ConPTY path — open a hidden PTY, round-trip a sentinel, and warn if the #1 blank-terminal condition is present *before* the user hits it.
- ✅ Graceful-degradation matrix — render a visible "X not installed → install with …" state for every missing external tool (LSP/DAP/formatters/git) instead of a silent no-op, with a test that asserts the degraded UI appears.

**Security**
- 🟡 Content-Security-Policy for the webview — lock down `connect-src`/`img-src`/`script-src` (matters because the preview pane loads untrusted local dev servers and markdown can embed remote images).
- 🟡 LAN-share auth + a persistent "🔴 Sharing on" status-bar indicator + a bound-interface picker; ensure secret redaction also covers the shared HTML/SSE/WS stream.
- 🟡 AI command audit log — append-only record of every shell command the agent ran, paired with a "require approval for commands matching <pattern>" rule set.
- 🟡 Secret-redaction lint — a test/util that scans outbound surfaces (logs, crash bundles, recordings, share stream) for API-key / `Authorization:`-shaped strings and refuses to emit them.

**Performance & resource safety**
(Derived from the 2026-07 Zed/terax research and the 2026-07-11 optimization sweep — full notes in git history, see the feature-backlog section above. The slot-reaping, alt-screen eviction, motion→CSS, Criterion harness, cargo-profile, and clippy-lint items that used to live here all shipped — see CHANGELOG `[Unreleased]`.)
- 🟡 Verify frontend-generated device-query replies (DA/DSR/CPR, generated frontend-side) route through the ordered per-session PTY writer path and can't interleave with user keystrokes — upstream terax hit exactly this ordering class in July 2026 (their #1004), the class Nexis solved for regular input in 1.20.6.
- 🟡 Snapshot-pattern refactors — replace lock-shaped sharing with cheap `Arc` copy-on-write snapshots for git status recomputation and file-tree diffing; also the design basis for persistent-session scrollback. Zed's rule of thumb: if a background task needs a `Mutex` on the hot path, the data structure is wrong — make reads snapshot-cheap instead (our poisoned-mutex pitfalls #8/#9 are downstream symptoms of lock-shaped sharing).
- [x] ~~Large-file editor mode~~ — done (see CHANGELOG `[Unreleased]`).
- [x] ~~Opt-in memory self-report~~ — done (see CHANGELOG `[Unreleased]`).
- ✅ Minimap `<canvas>` rewrite — drive it from a CodeMirror `updateListener`, dropping the 200 ms interval and per-line DOM entirely; the cheap memoization fix shipped in 1.20.6, this is the nice-to-have on top.
- [x] ~~`vscodeFolderIcons.json` ships as a JS module~~ — done, both icon JSONs now fetch as static assets (see CHANGELOG `[Unreleased]`).
- 🟡 React Compiler evaluation — try `babel-plugin-react-compiler` in the Vite react plugin (React 19 already in place); potentially large win for a UI that re-renders on terminal title/cwd churn, medium risk around CodeMirror/xterm ref patterns. Run `npx react-compiler-healthcheck` first.
- 🟡 Native FS watcher — `notify` crate emitting a debounced `nexis://fs-changed` event, replacing the explorer's 3 s `tree.refresh` poll; weigh ~200–300 KB against the binary budget.

**Testing & observability**
- 🟡 E2E coverage for the blank-terminal pitfalls — script the exact ConPTY failure modes (close-tab-then-open, cross-drive `cd` + new tab, PowerShell first-prompt) so pitfall #1 can never silently regress.
- 🟡 Diagnostics bundle export — one button that zips logs + versions + sanitized config + the last asciinema recording for bug reports (everything stays local, user attaches it manually).
- [x] ~~Sync-command audit tripwire~~ — done (see CHANGELOG `[Unreleased]`).
- 🟡 tmux resize desync test — targeted test for xterm grid vs PTY winsize desync after a pane resize; upstream terax has this open as #981 and Nexis's debounced fit + `pty_resize` may or may not be immune.

**Terminal & editor robustness**
- 🟡 Unicode/grapheme correctness golden-file suite — CJK width, emoji ZWJ sequences, combining marks, zero-width handling — so rendering-width bugs surface in CI.
- [x] ~~Shell-integration resilience~~ — done: missing markers detected, OS-level cwd fallback on Linux (see CHANGELOG `[Unreleased]`).
- [x] ~~Editor autosave + crash recovery~~ — done (see CHANGELOG `[Unreleased]`).

**Docs (nexis-wiki — separate repo)**
Structure ideas taken from zed.dev/docs (July 2026 sidebar survey — full notes in git history).
- ✅ "Coming from…" migration guides — Warp, iTerm2, Windows Terminal, kitty/alacritty, VS Code terminal; highest-leverage docs addition.
- ✅ Top-level Privacy & Security section — no-telemetry stance, per-provider AI data flow, tool approval, path guards; it's a differentiator, currently undocumented publicly.
- 🟡 Generated Reference section — all-settings page generated from the settings store schema, keybindings table, CLI flags; hand-written reference pages rot.
- 🟡 Per-platform troubleshooting pages seeded from the internal pitfall checklists (e.g. public "blank terminal on Windows" walkthrough of CLAUDE.md pitfall #1, in user language).
- 🟡 "Developing Nexis" section — build from source, architecture front door linking to the repo, profiling guide.

**Stretch features**
- 🟡 Git-backed AI checkpoints — snapshot to a hidden ref/stash before any agent edit/multi-edit; surface a one-click "revert this agent action". Turns the scariest part of an agentic terminal into a safe, reversible operation, and it's all local git.
- 🟠 Local semantic code index — embeddings over the workspace for sharper AI context retrieval; needs an embeddings source and a small vector store, weighed against the size budget.
- 🟡 Command prediction — next-command suggestions from recent context (BYOK or local), fitting the existing inline-suggestion UI.
- 🟡 App icon / brand refresh — the current icon (black/white woven mesh) reads as a placeholder; a redesign should draw from the welcome screen's animated blue gradient, the app's strongest visual identity (deferred P8 from the June 2026 UI critique — everything else from that critique shipped in 1.15.0).
- 🟠 Plugin sandboxing + first-party SDK — a sandboxed, typed, install-from-workspace SDK with a local test harness (pairs with "Custom AI tool authoring" above).
- 🟠🔴 Collaborative editing (CRDT) — real-time co-editing via a yjs/automerge-class CRDT; powerful but a major subsystem and a networking story, probably beyond a terminal-first tool's scope.

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
