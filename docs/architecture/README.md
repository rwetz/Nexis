# Architecture

How Nexis works, subsystem by subsystem. These are narrative guides — read them to build a mental model
before changing something. For "where does X live", use the [vault](../vault/Home.md) instead; for
invariants you must not break, [CLAUDE.md](../../CLAUDE.md) is authoritative.

## Reading order

Start with the two-process model — every other guide assumes it.

| Guide | What it covers |
|---|---|
| [two-process-model.md](two-process-model.md) | The Rust core / webview split, the IPC seam, why some commands are `async`, how multiple windows stay in sync |
| [pty-shell-integration.md](pty-shell-integration.md) | Terminal sessions end to end: thread topology, backpressure, shell integration markers, ConPTY |
| [terminal-renderer-pool.md](terminal-renderer-pool.md) | Why 40 open tabs don't cost 40 WebGL contexts — slot pooling, parking, reaping |
| [ai-subsystem.md](ai-subsystem.md) | The agent turn: message pipeline, tool registry, approval gates, subagents, compaction |
| [security-model.md](security-model.md) | Trust boundaries: workspace authorization, tool approval, key storage, SSRF/rebinding defenses, CSP |

## The 60-second version

Nexis is a [Tauri 2](https://tauri.app) desktop app. A **Rust core process** owns everything privileged —
PTY sessions, filesystem, git, subprocesses, the OS keychain, outbound HTTP — and a **webview process**
renders the entire UI in React 19. They talk over Tauri's IPC: request/response `invoke()` calls for
commands, and `Channel`s for high-volume streams like PTY output and AI token streams.

Almost all product logic lives in the frontend. The Rust side is deliberately thin and mostly exists to
do the things a webview can't do safely or at all — which also makes it the natural place to put the
security boundary. Every user-supplied path crosses an authorization check on the way in; every
subprocess is built through one sanctioned constructor; every outbound AI request is classified against
private-network ranges before a socket opens.

The single most important thing to know before touching the backend: **Tauri runs non-`async` commands on
the main thread**, so a blocking command stalls the UI *and* every queued keystroke behind it. See
[two-process-model.md](two-process-model.md#the-main-thread-rule).

## Diagrams

The guides use [Mermaid](https://mermaid.js.org), which GitHub renders natively in markdown. If you're
reading in an editor that doesn't, the accompanying prose stands on its own.
