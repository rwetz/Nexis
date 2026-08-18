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

## Custom feature requests (top priority)

Owner-requested work, ahead of everything below it. These are handed out **one at a time** as normal
requests — each bullet is scoped to stand alone as a single task, so pick one, finish it, changelog it,
and stop. Don't batch them.

- [ ] **Lumen ↔ Nexis integration** — cross-compatibility between Lumen and Nexis: shared/portable
  config and theme formats, launching one from the other, and a defined handoff for workspace and session
  state. Start with a written interop contract (what's shared, what's owned by which app, what the
  versioning story is) before writing code — this is a design task first and an implementation task
  second.

- [ ] **SignPath.io code signing for Windows** — get Windows builds signed so SmartScreen and Defender
  stop blocking installs. Includes: SignPath project/OSS-sponsorship setup, wiring the signing step into
  the release workflow for the NSIS and MSI artifacts, and confirming a clean download-and-install on a
  fresh Windows VM. Largely external/account work — the blocking step is the SignPath approval, so start
  that early.

- [ ] **Ongoing: visual differentiation from terax** — a standing item, not a one-shot. Nexis should not
  read as a reskin. Sweep the UI surface for inherited layout, spacing, motion, and component idioms and
  make deliberate choices instead of default-inherited ones. Track what's been re-done so this doesn't
  get re-litigated; the credit in the README stays regardless — differentiation is about identity, not
  about hiding the lineage.
  *Re-done so far:* the theme set and the icon/mark; the icon surface (semantic choke point, Phosphor,
  house size scale, real provider brand marks) and the motion system (house easing/duration tokens wired
  into Tailwind's defaults, stepped spinner, caret-cadence status blink) and the file-tree retint onto the
  active theme's ANSI palette. *Still inherited:* layout and spacing scale, panel/rail component idioms.

---

## Up next

- [ ] **Expansion packs — core + opt-in feature surface** — the sidebar's ~24 panels split into a fixed core (terminal, editor, Files, Recent Files, Source Control, AI chat via API) plus toggleable packs (navigation-plus, code-tools, ai-extras, dev-tools, ml-lab, advanced). Enablement gating, not installation — nothing is downloaded except the future nexis-ml flow. Taxonomy and decisions in `docs/vault/decisions/expansion-packs.md`; taxonomy source of truth in `src/lib/packs.ts`.
  - [ ] **V2 — migrate hardwired panels into the plugin registry**, one per PR as they're touched (Debugger/Database/Advanced group first — already lazy-loaded). The mechanism and design pass are done: `PanelContribution` carries icon/group/pack/order, the rail renders registry panels, and `plugin:`-namespaced view ids keep the built-in union closed (design + migration constraints in `docs/vault/decisions/expansion-packs.md`). **Each migration must ship a one-time view-id remap** in `readSidebarView` and `loadPinned` in the same change, or it orphans saved sidebar state and pinned-rail entries.
  - [ ] **V4 — polish, driven by real usage**: discoverability for Bare-Bones users; per-pack settings / simpler feature variants only if users ask (deliberately cut from V1). (The "enable this pack?" placeholder shipped; V3's pinned-checksum install flow shipped — decision in `docs/vault/decisions/nexis-ml-artifact-pinning.md`. Follow-up for nexis-ml-rs CI: publish `checksums.txt` per release so Nexis pins can be cross-checked against CI output.)
- [ ] **Persistent terminal sessions** — PTY sessions survive Nexis restarts; reconnect to a running shell without losing scrollback or process state; native implementation inspired by tmux session persistence but without the terminal multiplexer overhead. Two independently shippable milestones:
  - **Milestone B — live process persistence (PTY broker)**: shells keep running while Nexis is closed. PTY ownership moves to the same `nexis` binary launched headless (`nexis --pty-broker` — no second binary), talked to over a named pipe (Windows) / Unix socket with a length-prefixed `open/write/resize/close/list/attach` protocol plus a streamed output channel and a capped ring buffer replayed on `attach`. Per-tab opt-in ("Keep alive after close") + global default; private tabs excluded; broker exits with its last session; user-only socket permissions + random token handshake. Windows carry-overs: the ConPTY lifecycle lock and `hide_console` discipline move into the broker; ConPTY handles can't cross processes, so the broker owns the full PTY lifecycle. Non-goals: no tmux-style server-side window management, no multi-client input, no reboot survival.
- [ ] **ML Lab follow-ups** — publish `nexis-ml` to PyPI (trusted-publisher setup on pypi.org — external, blocks the panel's Python-engine install button working from a cold machine); close the Rust-engine feature gaps (config-only today: no textgen/blank templates, no inference playground, no HTML report); image-template ONNX export. Design record and known limits in `ML_SUITE.md`; the nexis-ml-rs `checksums.txt` CI follow-up is tracked under expansion packs V4 above.

---

## Later

- [ ] **Remote workspace** — browse, edit, and run code on remote machines entirely over SSH; the file explorer and editor work against the remote filesystem via SFTP while the terminal is already there; the goal is a seamless local feel with zero local clones required
- [ ] **Selective TS → Rust migration** — profile hot paths (terminal input dispatch, diff rendering, file-tree diffing), identify where a Rust implementation gives a measurable win, migrate incrementally without growing bundle size; Zed's SumTree (summary-carrying copy-on-write B+-tree, `sum_tree` crate in their repo — one tree answers offset→line, line→hunk, path→subtree-size without separate indexes) is the reference design if diff rendering or tree diffing is the target; don't build it until a benchmark says the naive version is the bottleneck
- [ ] **Multiplayer terminal input (authenticated)** — the live view stays read-only for now, but the auth prerequisite shipped: the share URL carries a per-session token checked on every route (incl. `/ws`). Remaining for full multiplayer (remote viewers typing into the shared terminal): an input-consent toggle on the host, an input message protocol on the WS channel, and routing through the ordered per-session PTY writer

---

## Feature backlog — upstream terax adoption

Candidates from a survey of upstream terax-ai v0.6.4 → v0.8.5 (researched 2026-07-15; the full research notes — `TERAX_INSPIRATION.md`, `ZED_INSPIRATION.md`, `OPTIMIZATIONS.md`, `UI_IMPROVEMENTS.md`, `PLAN.md` — were consolidated into this file on 2026-07-17 and live in git history). A pool, not commitments — each is a product call. OSC 52 clipboard already landed from this list. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

- 🟠 **Block-mode terminal — custom input bar.** The remaining half of the block-mode item; the pure-frontend slices are done (prompt-block navigation and the interactive per-command block gutter both shipped — see CHANGELOG `[Unreleased]`). What's left is the genuinely invasive part: a custom input bar with OSC-133-gated stdin routing, so typing goes to the bar at a prompt but falls through to the raw terminal the moment a full-screen program (vim/htop/sudo) owns the tty. **This is a product decision before it is an implementation** — it changes the app's fundamental typing model, and getting the gating wrong breaks terminal input, the one thing that must never regress. Known limitations to inherit knowingly: block tabs are single-pane, and the mode depends on OSC 133 shell integration (which Nexis already injects). Suggest it ship behind a pref, off by default.
- 🟡 **Spaces — persisted tab groups** with drag-to-organize, above tabs; natural fit with the existing layout-persistence store.
- 🟡 **whisper.cpp speech-to-text** — fully offline voice input by shelling out to a user-installed binary (like Ollama/LM Studio — never embedded, per the size-budget hard limit); voice is OpenAI-only today.

---

## Feature backlog — Warp / Zed / lightweight-terminal survey

A second inspiration pass (2026-07-18), this time against Warp, Zed, Ghostty, WezTerm, and Kitty rather than terax — looking for what each does *best* and where it fits without crossing a hard limit above (no accounts, no bundled inference, no VS Code scope creep). A pool, not commitments. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

**Terminal UX**
- 🟠 **Kitty graphics protocol.** The remaining inline-image gap now that Sixel and the iTerm2 protocol have shipped (see CHANGELOG `[Unreleased]`). A separate specification with its own placement/z-index and animation model — not covered by `@xterm/addon-image`, so this is a real implementation rather than a config flag.

**AI / agent**
- 🟡 **Local edit-prediction via Zeta.** Zed's [Zeta](https://huggingface.co/zed-industries/zeta) is an open-weight, Qwen2.5-Coder-based next-edit-prediction model purpose-built for "what's the next small edit" rather than general chat. Running it through Ollama would give the editor's inline-completion and the "Command prediction" item below a local, zero-cost option — fits the existing BYOK/local-model shelling-out pattern exactly (no bundled inference, same posture as Ollama/LM Studio/MLX today).
- 🟡 **Shell-history semantic search.** Extends the "Local semantic code index" item below to also index command history — Warp Drive's "what was that docker command from last week" without an account or cloud sync, since the vector store would already be local.

**Editor**
- 🟡 **Grep results as an editable multibuffer.** Zed's standout editor feature: search-result matches across many files open as one scrollable, directly-editable view instead of jumping file to file, committing changes back per-file on save. Pairs cleanly with the existing `fs_grep` backend (already built on the same `grep-regex`/`grep-searcher`/`grep-matcher` crates ripgrep itself uses) — the new work is a CodeMirror view that maps regions back to source files, not a new search engine.

**Architecture / open-source tech note**
- 🟡 **`wasmtime` for the plugin-sandboxing stretch item.** Zed's own extension system already solved "sandboxed, typed, third-party code" with `wasmtime` + the WASM component model — worth adopting the same approach for the "Plugin sandboxing + first-party SDK" item below rather than re-deriving a sandbox story from scratch. Binary-size cost needs a real measurement before committing either way.

---

## Hardening backlog

Reliability, security, and performance ideas tracked for the "bulletproof and solid" goal (migrated here from the former `IDEAS.md` brainstorm). These are a raw pool, not commitments. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

**Reliability & correctness**
- 🟡 Finish the panic-lint gate: four modules remain outside `#![warn(clippy::unwrap_used, clippy::expect_used)]` because they still have production unwraps to convert — `fs/file.rs` (10), `lsp/mod.rs` (4), `dap/mod.rs` (4), `pty/session.rs` (2). The other 36 modules are gated as of 2026-07-19.
- 🟡 Windows startup self-test for the ConPTY path — open a hidden PTY, round-trip a sentinel, and warn if the #1 blank-terminal condition is present *before* the user hits it.

**Performance & resource safety**
(Derived from the 2026-07 Zed/terax research and the 2026-07-11 optimization sweep — full notes in git history, see the feature-backlog section above. The slot-reaping, alt-screen eviction, motion→CSS, Criterion harness, cargo-profile, and clippy-lint items that used to live here all shipped — see CHANGELOG `[Unreleased]`.)
- 🟡 Snapshot-pattern refactors — replace lock-shaped sharing with cheap `Arc` copy-on-write snapshots for git status recomputation and file-tree diffing; also the design basis for persistent-session scrollback. Zed's rule of thumb: if a background task needs a `Mutex` on the hot path, the data structure is wrong — make reads snapshot-cheap instead (our poisoned-mutex pitfalls #8/#9 are downstream symptoms of lock-shaped sharing).
- 🟡 React Compiler evaluation — try `babel-plugin-react-compiler` in the Vite react plugin (React 19 already in place); potentially large win for a UI that re-renders on terminal title/cwd churn, medium risk around CodeMirror/xterm ref patterns. Run `npx react-compiler-healthcheck` first.

**Testing & observability**
- 🟡 E2E coverage for the blank-terminal pitfalls — script the exact ConPTY failure modes (close-tab-then-open, cross-drive `cd` + new tab, PowerShell first-prompt) so pitfall #1 can never silently regress.
- 🟡 tmux resize desync test — targeted test for xterm grid vs PTY winsize desync after a pane resize; upstream terax has this open as #981 and Nexis's debounced fit + `pty_resize` may or may not be immune.

**Terminal & editor robustness**
- 🟡 Unicode/grapheme correctness golden-file suite — CJK width, emoji ZWJ sequences, combining marks, zero-width handling — so rendering-width bugs surface in CI.

**Docs (nexis-wiki — separate repo)**
Structure ideas taken from zed.dev/docs (July 2026 sidebar survey — full notes in git history).
- ✅ "Coming from…" migration guides — Warp, iTerm2, Windows Terminal, kitty/alacritty, VS Code terminal; highest-leverage docs addition.
- ✅ Top-level Privacy & Security section — no-telemetry stance, per-provider AI data flow, tool approval, path guards; it's a differentiator, currently undocumented publicly.
- 🟡 Generated Reference section — all-settings page generated from the settings store schema, keybindings table, CLI flags; hand-written reference pages rot.
- 🟡 Per-platform troubleshooting pages seeded from the internal pitfall checklists (e.g. public "blank terminal on Windows" walkthrough of CLAUDE.md pitfall #1, in user language).
- 🟡 "Developing Nexis" section — build from source, architecture front door linking to the repo, profiling guide.

**Stretch features**
- 🟠 Local semantic code index — embeddings over the workspace for sharper AI context retrieval; needs an embeddings source and a small vector store, weighed against the size budget.
- 🟡 Command prediction — next-command suggestions from recent context (BYOK or local), fitting the existing inline-suggestion UI.
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
