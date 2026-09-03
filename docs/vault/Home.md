---
type: index
description: Entry point for the Nexis knowledge vault. Agents and humans start here.
---

# Nexis Vault — Home

This vault is the **navigational knowledge base** for the Nexis codebase. It answers "where does X live, how does it connect, and why is it built that way" — the things that are expensive to re-derive by grepping a large repo.

**Division of labor (do not duplicate):**

- `CLAUDE.md` (repo root) — invariants, pitfalls, pre-push checklist. Authoritative.
- `CHANGELOG.md` — the record of what shipped. Authoritative.
- **This vault** — architecture maps, subsystem guides, cross-cutting flows, decision records, runbooks.

## Start here

- [[conventions]] — how notes are written and maintained (read before adding a note)

## Maps (`maps/`)

- [[frontend-modules]] — every module under `src/modules/`
- [[rust-modules]] — every backend module under `src-tauri/src/modules/`
- [[ipc-surface]] — the frontend ↔ Rust seam: all command families, handlers, bridge files, channels, events
- [[zustand-stores]] — every state store and what it owns

## Subsystems (`subsystems/`)

- [[pty]] — terminal sessions end to end
- [[ai]] — agent loop, providers, tools, subagents, compaction
- [[settings-sync]] — preferences storage and cross-window sync
- [[editor]] — CodeMirror panes, shared extensions, autocomplete, zoom interplay
- [[theming]] — theme data → CSS variables, the generated Nexis ramp, community and custom sets
- [[window-chrome]] — borderless chrome: decorations config, drag region, window controls, Linux edge resize
- [[system-monitor]] — btop-style resource analyzer: sysinfo sampling, braille charts, process table
- [[ml-lab]] — the external `nexis-ml` engine: detection, spawn bridge, training store, charts and network diagram
- [[icon-and-motion-system]] — the semantic icon choke point, the house size scale, file-tree retint, motion tokens
- [[e2e-harness]] — how the Windows E2E suite gets a session: the compiled-in debugging port, the config overlay, seeded first-run prefs, and why the helper asserts clickability rather than the absence of an overlay
- [[onboarding]] — the first-run flow: preset, tour, Getting Started checklist, and why all of it derives from `enabledPacks`
- [[web-dev-pack]] — multi-viewport preview, the REST client and its own SSRF-guarded Rust command, the local-only scratchpad tools
- [[art-pack]] — the SVG playground: icon-scale preview, the in-house optimizer, and why the preview is sanitized

## Flows (`flows/`)

- [[terminal-tab-open]] — tab UI → `workspace_authorize` → `pty_open` → first bytes on screen
- [[prefs-propagation]] — Settings window change → `writePref` → event → main window re-render

## Runbooks (`runbooks/`)

- [[react-doctor]] — running the React hygiene audit, its config, and the fix recipes for impure updaters and render-phase ref writes
- [[release]] — cutting a tagged release: the four version files that move together, the CHANGELOG rename, and what the tag push triggers

## Other sections

- `decisions/` — lightweight ADRs: why something is the way it is, alternatives rejected. [[expansion-packs]], [[nexis-ml-artifact-pinning]], [[program-resolution-before-spawn]] (new ones from `templates/decision.md`)
- `runbooks/` — how to do rare-but-recurring tasks (release, debugging a class of bug, forcing cache refreshes)
- `templates/` — copy these when creating a new note
