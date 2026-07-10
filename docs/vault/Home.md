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

## Flows (`flows/`)

- [[terminal-tab-open]] — tab UI → `workspace_authorize` → `pty_open` → first bytes on screen
- [[prefs-propagation]] — Settings window change → `writePref` → event → main window re-render

## Other sections

- `decisions/` — lightweight ADRs: why something is the way it is, alternatives rejected (empty so far — use `templates/decision.md`)
- `runbooks/` — how to do rare-but-recurring tasks (release, debugging a class of bug, forcing cache refreshes)
- `templates/` — copy these when creating a new note
