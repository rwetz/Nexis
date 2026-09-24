---
type: map
description: Inventory of all modules under src/modules/ with one-line purposes, grouped by area.
---

# Frontend modules (`src/modules/`)

As of 2026-07. One-liners are orientation, not spec — verify in code, and fix here if wrong.

## Core surfaces

- `terminal` — xterm.js terminal UI; `lib/pty-bridge.ts` is the IPC seam to the Rust PTY (see [[pty]] and AGENTS.md pitfall #1)
- `editor` — code editor surface
- `ai` — AI chat/agent: `lib/agent.ts` (agent loop, reasoning pruning), `lib/compact.ts` (context compaction), `tools/` (tool impls incl. `shell.ts` session shells), `agents/`, `store/`
- `explorer` — file tree / workspace browser
- `tabs` — tab management (interacts with PTY open/close lifecycle)
- `settings` — preferences UI + `store.ts`; **all setters must route through `writePref()`** (AGENTS.md pitfall #2)

## Dev-tool integrations

- `lsp` — language server client · `debugger` — DAP client · `problems` — diagnostics panel (the bottom panel's first tab) · `bottom-panel` — the session surface under the workspace · `web-workbench` — Ports, HTTP Client and Web Tools as one title-bar tab ([[navigation-surfaces]])
- `testrunner` — test execution UI · `build` — build tasks · `repl` — language REPLs
- `python` / `notebook` / `ml` — Python, Jupyter-style notebooks, ML Lab workbench
- `database` — DB client · `containers` — container management · `ssh` — remote sessions · `ports` — port forwarding/monitor

## Git & review

- `source-control` — stage/commit UI · `git-history` — log/blame views · `code-review` — review workflow · `release` — release tooling

## Workspace & navigation

- `workspace` — workspace roots/authorization (frontend side of `workspace.rs`)
- `sidebar` · `header` · `statusbar` (see AGENTS.md pitfall #14 — Zustand selector rule) · `window` · `shortcuts` · `symbol-search` · `recent-files` · `bookmarks` · `workspace-notes`

## Content & misc

- `markdown` · `preview` · `image-viewer` — viewers/renderers
- `snippets` / `shell-snippets` / `prompt-templates` — reusable content
- `profiles` — shell profiles · `theme` — theming · `notifications` · `processes` — Nexis's own background processes · `sysmon` — system resource analyzer ([[system-monitor]]) · `agent-queue` — queued agent runs · `refactor` · `share` — sharing (pairs with `http_share.rs`) · `updater` — app updates

## Shared (outside modules/)

- `src/lib/path.ts` — canonical `dirname`/`basename` helpers; **never write a local copy** (AGENTS.md pitfall #12)
- `src/lib/pitfall-guards.test.ts` — frontend tripwire suite; never weaken
- `src/lib/plugins/` — contribution contracts, registry (`usePluginRegistry`) and activation host; `src/plugins/` contains first-party plugin implementations
- `src/app/App.tsx` — workbench composition and the built-in sidebar render chain; see [[architecture-boundaries]] for extraction seams
- `src/modules/atlas/` / `src/modules/benchmark/` — absorbed host-scoped tools, with embedded panels and companion windows; see [[atlas]] and [[benchmark]]
