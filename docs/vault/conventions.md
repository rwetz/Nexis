---
type: meta
description: Rules for writing and maintaining vault notes — for agents and humans.
---

# Vault conventions

## Why this vault exists

Nexis is large (~45 frontend modules, ~15 Rust modules). An agent starting cold burns most of its context window rediscovering structure. The vault front-loads that: read [[Home]] + the relevant subsystem note, and you know where to look before your first grep.

## Note rules

1. **One topic per note.** A note answers one question. If it grows two headings that could stand alone, split it and link.
2. **Kebab-case filenames**, e.g. `pty.md`, `terminal-tab-open.md`. The filename is the wiki-link target.
3. **Frontmatter required:**
   ```yaml
   ---
   type: map | subsystem | flow | decision | runbook | meta
   description: one line — used to judge relevance without opening the note
   ---
   ```
4. **Link liberally with `[[wiki-links]]`.** A link to a note that doesn't exist yet is fine — it marks something worth writing.
5. **Reference code as `path/to/file.rs:symbol`**, not by pasting code. Pasted code goes stale silently; paths get checked when followed.
6. **Point at authority, don't copy it.** If CLAUDE.md or CHANGELOG covers something, link/mention it — never restate it here where it can drift.
7. **Convert relative dates to absolute** ("as of 2026-07", not "recently").

## Maintenance protocol (agents)

- **Before working on a subsystem:** read its note in `subsystems/` if one exists.
- **After non-trivial work:** update the touched note — fix anything you found to be stale, add what you had to discover the hard way. If no note exists and you did real discovery, create one from `templates/`.
- **Staleness is worse than absence.** If you find a claim that contradicts the code, fix or delete it immediately — a wrong map sends the next agent in the wrong direction.
- Keep notes **short** (aim < 100 lines). This is a map, not documentation of record.

## Obsidian specifics

- The vault root is `docs/vault/`. Open that folder in Obsidian; it will create `.obsidian/` (gitignored — personal config).
- No plugins are required. Everything here is plain markdown + wiki-links, readable by any tool.
