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

- [ ] **Persistent terminal sessions** — PTY sessions survive Nexis restarts; reconnect to a running shell without losing scrollback or process state; native implementation inspired by tmux session persistence but without the terminal multiplexer overhead
- [ ] **Custom AI tool authoring** — write and test new agent tools in TypeScript using the Plugin API; a first-party SDK with type definitions, a local test harness, and one-command installation into a workspace

---

## Later

- [ ] **Remote workspace** — browse, edit, and run code on remote machines entirely over SSH; the file explorer and editor work against the remote filesystem via SFTP while the terminal is already there; the goal is a seamless local feel with zero local clones required
- [ ] **Selective TS → Rust migration** — profile hot paths (terminal input dispatch, diff rendering, file-tree diffing), identify where a Rust implementation gives a measurable win, migrate incrementally without growing bundle size
- [ ] **Multiplayer terminal input (authenticated)** — the 1.18.0 live view is deliberately read-only because the LAN share server has no auth; full multiplayer (remote viewers typing into the shared terminal) needs an auth story first — e.g. a per-session token in the share URL plus an input-consent toggle on the host

---

## Hardening backlog

Reliability, security, and performance ideas tracked for the "bulletproof and solid" goal (migrated here from the former `IDEAS.md` brainstorm). These are a raw pool, not commitments. Feasibility: ✅ doable now · 🟡 moderate · 🟠 heavy lift.

**Reliability & correctness**
- 🟡 Extend the panic-lint gate (`clippy::unwrap_used`/`expect_used`) from the security-critical command modules (net, secrets, recording) to the remaining `#[tauri::command]` modules, converting each production `unwrap`/`expect` to real error handling as it's enabled.
- 🟡 PTY thread watchdog — detect a silently-dead reader/flusher/waiter thread (pitfall #8) via a heartbeat counter and surface "terminal stalled — reopen?" instead of an invisible hang.
- 🟡 Windows startup self-test for the ConPTY path — open a hidden PTY, round-trip a sentinel, and warn if the #1 blank-terminal condition is present *before* the user hits it.
- ✅ Graceful-degradation matrix — render a visible "X not installed → install with …" state for every missing external tool (LSP/DAP/formatters/git) instead of a silent no-op, with a test that asserts the degraded UI appears.

**Security**
- 🟡 Content-Security-Policy for the webview — lock down `connect-src`/`img-src`/`script-src` (matters because the preview pane loads untrusted local dev servers and markdown can embed remote images).
- 🟡 LAN-share auth + a persistent "🔴 Sharing on" status-bar indicator + a bound-interface picker; ensure secret redaction also covers the shared HTML/SSE/WS stream.
- 🟡 AI command audit log — append-only record of every shell command the agent ran, paired with a "require approval for commands matching <pattern>" rule set.
- 🟡 Secret-redaction lint — a test/util that scans outbound surfaces (logs, crash bundles, recordings, share stream) for API-key / `Authorization:`-shaped strings and refuses to emit them.

**Performance & resource safety**
- 🟡 Lazy-load the debugger / database / Jupyter panels the way language packs already are, so they cost nothing at startup for users who never open them.
- 🟡 Large-file editor mode — detect file size on open and auto-disable LSP/lint/minimap/folding above a threshold, with a banner offering to re-enable.
- ✅ Opt-in memory self-report — a debug status-bar readout of scrollback bytes, recording size, and AI-history tokens so resource creep is visible during development.

**Testing & observability**
- 🟡 E2E coverage for the blank-terminal pitfalls — script the exact ConPTY failure modes (close-tab-then-open, cross-drive `cd` + new tab, PowerShell first-prompt) so pitfall #1 can never silently regress.
- 🟡 Diagnostics bundle export — one button that zips logs + versions + sanitized config + the last asciinema recording for bug reports (everything stays local, user attaches it manually).

**Terminal & editor robustness**
- 🟡 Unicode/grapheme correctness golden-file suite — CJK width, emoji ZWJ sequences, combining marks, zero-width handling — so rendering-width bugs surface in CI.
- ✅ Shell-integration resilience — detect missing prompt markers (pitfall #6 territory) and fall back gracefully instead of mis-tracking cwd.
- 🟡 Editor autosave + crash recovery — periodic dirty-buffer snapshots to a scratch dir, offered for recovery on next launch.

**Stretch features**
- 🟡 Git-backed AI checkpoints — snapshot to a hidden ref/stash before any agent edit/multi-edit; surface a one-click "revert this agent action". Turns the scariest part of an agentic terminal into a safe, reversible operation, and it's all local git.
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
