# Ideas & Hardening Backlog

A working brainstorm — mostly stretch goals — biased toward making Nexis **bulletproof and solid** rather than just adding surface area. Every item is rated for feasibility against the *current* stack (Tauri 2 + Rust + React 19 + xterm.js + CodeMirror 6).

This is a raw idea pool, not a commitment. Curated, committed work lives in [ROADMAP.md](ROADMAP.md).

## Already shipped (removed from this backlog)

Done across **v1.15.1 – v1.15.15** (see [CHANGELOG.md](CHANGELOG.md) for detail), so they're no longer listed below — the ID gaps (A2–A4, D1–D2) are intentional:

- **CI typecheck gate** (`tsc --noEmit`) + **macOS CI job** — old D1/D2 and the "CI doesn't typecheck" hole.
- **Global panic hook + crash log** (old A2) — a `panic="abort"` death now writes a report to `{cache}/nexis/crash/`.
- **Fuzz tests on the untrusted-byte parsers** (old A3) — DA filter, git porcelain parser, shell cwd-sentinel, the SSRF classifier / URL / header guards, and the AI tool path/command guards.
- **Property tests for the path & auth guards** (old A4) — the spawn-sandbox prefix match and `dirname`/SSRF edge cases.
- **Prod `pnpm audit` gate** + cleared every prod advisory (mermaid/uuid) — the core of old B5.
- **A bug-and-cleanup sweep** — git worktree authorization bypass, `from_utf8` data loss, two Rules-of-Hooks violations, EditorPane re-render, and assorted poison-lock / `unwrap` conversions.

## How to read the ratings

| Rating | Meaning |
|--------|---------|
| ✅ | Doable now — the stack already supports it, it's mostly just code |
| 🟡 | Moderate — new code and maybe a small dependency, no architectural change |
| 🟠 | Heavy lift — significant new infra or a sizeable dependency; weigh against the <10 MB / `opt-level="s"` budget |
| 🔴 | Fights the stack or a non-negotiable — would mean giving up a core constraint |

---

## A. Reliability & correctness — the "bulletproof" core

- **A1. Panic lint gate (audit mostly done).** 🟡 The reachable production panics found so far are converted; what remains is the *gate*: add `#![warn(clippy::unwrap_used, clippy::expect_used, clippy::indexing_slicing)]` scoped to the `#[tauri::command]` modules (with `allow-unwrap-in-tests` in `clippy.toml`) so new ones are caught by the existing `clippy -D warnings` CI job. Also still open: the deliberately-deferred `pty/session.rs` reader/flusher/waiter thread-spawn `.expect()`s (a correct fix must kill the just-spawned child on the error path).
- **A5. Unbounded-buffer sweep (partial).** ✅ `http_share` request reads and the LSP/DAP `Content-Length` allocation are now capped; PTY `MAX_PENDING` and the shell ring buffer were already capped. Still to audit for a ceiling + graceful "truncated" signal: AI message history, asciinema recording file size, and file-watch counts.
- **A6. PTY thread watchdog.** 🟡 Detect a silently-dead reader/flusher/waiter thread (pitfall #8) and surface "terminal stalled — reopen?" instead of an invisible hang. A heartbeat counter checked on a timer.
- **A7. Graceful-degradation matrix.** ✅ LSP, DAP, formatters, and git all "silently degrade" when the external tool is missing. Make every one render a visible, actionable "X not installed → install with …" state instead of a silent no-op, and write a test that asserts the degraded UI appears.
- **A8. Startup self-test for the ConPTY path.** 🟡 On Windows launch, open a hidden PTY, write a sentinel, read it back; if it doesn't round-trip, warn the user that the #1-pitfall blank-terminal condition is present on their machine *before* they hit it.

---

## B. Security hardening

- **B1. Minimize the Tauri capability surface.** ✅ Audit `capabilities/*.json` and the command allowlist — the webview should be granted only the commands it actually calls. Every exposed command is attack surface if the renderer is ever compromised (e.g. via a malicious dev-server page in the preview pane).
- **B2. Content-Security-Policy for the webview.** 🟡 Lock down `connect-src`/`img-src`/`script-src`. Matters more than usual because the preview pane loads untrusted local dev servers and markdown can embed remote images.
- **B3. LAN-share auth + explicit indicator.** 🟡 `http_share` binds to the LAN with no auth (the request *size* is now capped, but anyone on the network can read the page). Add a one-time token in the share URL, let the user pick the bind interface, and keep a persistent "🔴 Sharing on" status-bar item so a conversation/terminal is never exposed without the user knowing. Ensure secret redaction (already in private tabs) also applies to the shared HTML/SSE stream.
- **B4. AI command audit log.** 🟡 Persist an append-only log of every command the shell tool executed on the user's behalf (the Notifications center is a start). Pairs with a "require approval for commands matching <pattern>" rule set.
- **B5. Supply-chain depth (remaining).** ✅ The prod `pnpm audit --prod --audit-level high` gate is in CI and `cargo audit` runs weekly. Still to add: `cargo deny` (licenses + advisories + duplicate-dep bans) and pinning GitHub Actions by commit SHA rather than tag (also addresses the Node-20 action deprecation CI flagged).
- **B6. Secret-redaction lint.** 🟡 A test/util that scans outbound surfaces (logs, crash bundles, recordings, share stream) for things that look like API keys / `Authorization:` headers and refuses to emit them.

---

## C. Performance & resource safety

- **C1. Bundle-size budget gate in CI.** ✅ The "<10 MB, no telemetry" line is a *non-negotiable* — enforce it. Fail CI if the release binary/installer exceeds a threshold so a careless dependency can't quietly blow the budget.
- **C2. Keep tokio minimal — document why.** ✅ `tokio` is pulled with only the `rt` feature on purpose. Add a contributor note: do not enable `net`/`io`/`full` without a size review (this directly constrains the WebSocket idea in F1).
- **C3. Lazy-load heavy panels.** 🟡 Code-split the debugger, database, and Jupyter panels the same way language packs are already lazy. They shouldn't cost startup time for users who never open them.
- **C4. Large-file editor mode.** 🟡 CodeMirror degrades past a few MB. Detect file size on open and auto-disable LSP/lint/minimap/folding above a threshold, with a banner offering to re-enable.
- **C5. Memory ceiling self-report.** ✅ A debug status-bar readout (opt-in) of scrollback bytes, recording size, and AI-history tokens so resource creep is visible during development.

---

## D. Testing, CI & observability

- **D3. E2E coverage for the blank-terminal pitfalls.** 🟡 The WebdriverIO harness should script the exact ConPTY failure modes (close-tab-then-open, `cd` to another drive then new tab, PowerShell first-prompt) so the #1 pitfall can never silently regress.
- **D4. Coverage threshold gate.** ✅ `vitest run --coverage` exists; wire a minimum-coverage gate so the number can't drift down.
- **D5. Diagnostics bundle export.** 🟡 One button that zips logs + versions + sanitized config + the last asciinema recording for bug reports — the telemetry-free way to get good crash data (everything stays local, user attaches it manually). Pairs with the crash hook already in place.

---

## E. Terminal & editor robustness

- **E1. Unicode/grapheme correctness suite.** 🟡 CJK width, emoji ZWJ sequences, combining marks, and zero-width handling in xterm — a golden-file test set so rendering width bugs surface in CI, not in screenshots.
- **E2. Persistent / reconnectable PTY sessions.** 🟠 (Already in ROADMAP "Later".) tmux-style survive-restart sessions. Heavy: needs a detached session host process and a reconnect protocol. Big robustness payoff.
- **E3. Shell-integration resilience.** ✅ Harden the case where a user's own shell profile breaks the prompt markers (pitfall #6 territory) — detect missing markers and fall back gracefully instead of mis-tracking cwd.
- **E4. Editor autosave + crash recovery.** 🟡 Periodic dirty-buffer snapshots to a scratch dir so an app crash never loses unsaved edits; offer recovery on next launch.

---

## F. Stretch features (the ambitious end)

- **F1. True-push multiplayer terminal (WebSocket).** 🟠 (ROADMAP "Up next".) Replaces 2 s polling with real push. The honest cost: the current `http_share` is blocking stdlib TCP; doing this *well* means an async server (`tokio` `net`/`io` + a `tungstenite`-class crate), which grows the binary — must be weighed against C1/C2.
- **F2. Remote workspace over SSH/SFTP.** 🟠 (ROADMAP "Later".) Edit/run on a remote box with a local feel. Large surface: virtual filesystem behind the explorer/editor, latency handling, auth.
- **F3. Git-backed AI checkpoints + one-click rollback.** 🟡 Before any AI edit/multi-edit, snapshot to a hidden ref or stash; surface a "revert this agent action" button. Turns the scariest part of an agentic terminal (it edited my files) into a safe, reversible operation. Strong "solid" story, and it's all local git.
- **F4. Local semantic code index.** 🟠 Embeddings over the workspace to power sharper AI context retrieval. Needs an embeddings source (reuse a BYOK provider or a local model) and a vector store — `rusqlite` + a small ANN, or sqlite-vss. New dependency weight to justify.
- **F5. Collaborative editing (CRDT).** 🟠🔴 Real-time co-editing via a yjs/automerge-class CRDT. Powerful but a major subsystem and a networking story; probably beyond a terminal-first tool's scope.
- **F6. Plugin sandboxing + first-party SDK.** 🟡🟠 (ROADMAP "Later": custom AI tool authoring.) The Plugin API exists internally; the stretch is a sandboxed, typed, install-from-workspace SDK with a local test harness. Sandboxing untrusted plugin code in a webview is the hard part.
- **F7. Command prediction / next-command suggestions.** 🟡 Beyond history-based inline suggestions — a small model predicting the *next* command from recent context. BYOK or local; fits the existing suggestion UI.

---

## G. Stack reality check — what we can and can't do

**The stack makes these first-class (✅):** native OS integration, PTY (`portable-pty`), file system, process-tree control (Windows Job Objects are already a dependency), OS keychain (`keyring`), streaming HTTP (`reqwest` + `stream`), rich terminal (xterm/WebGL) and editor (CodeMirror), multi-provider AI (Vercel AI SDK), and a typed plugin contribution surface. Most feature ideas are "just code."

**Possible but with a real trade (🟠):**
- **Real-time push networking** — the async runtime is deliberately minimal (`tokio` `rt`-only). WebSocket/true-push servers mean growing it + a ws crate. Doable, but it spends the size budget (C1/C2/F1).
- **Anything with a big native dependency** — database drivers beyond what's shelled out, media codecs, ML inference, vector search. `opt-level="s"` + `lto="fat"` + the <10 MB target mean each heavyweight crate needs a hard justification.

**Fights the stack or a non-negotiable (🔴):**
- **In-process local LLM inference** — bundling a llama.cpp-class engine blows the size budget. Correct call is the current one: shell out to Ollama / LM Studio / MLX.
- **Chromium-only web APIs** — the webview is the OS-native engine (WebView2 / WKWebView / WebKitGTK), so anything assuming Chromium behavior will diverge per platform. Webview-dependent UI must be tested on all three.
- **Telemetry-based features** — crash analytics SaaS, usage metrics, A/B funnels. "No accounts or telemetry, ever" is a stated non-negotiable; everything observability-related has to be local and opt-in (hence D5 and the local crash hook already shipped).
- **Mobile (iOS/Android)** — explicitly a non-goal, and the app's shape (shells, PTY, arbitrary fs access) doesn't map onto mobile sandboxes anyway.

---

## If I had to pick five (remaining)

To keep moving the "bulletproof and solid" needle, in order:

1. **A1 — the panic lint gate** — lock in the `unwrap`/`expect` audit so new ones can't regress.
2. **B1 — minimize the Tauri capability surface** — cut the renderer's attack surface to only the commands it actually uses.
3. **C1 — bundle-size budget gate** — make the <10 MB non-negotiable actually enforced in CI.
4. **F3 — git-backed AI checkpoints** — makes agentic file edits safe and reversible; pure upside, all local.
5. **A5 — finish the buffer-cap sweep** (AI history, recording) + **D4 — coverage threshold gate**.
