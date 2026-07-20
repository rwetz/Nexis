# Nexis documentation

Two audiences, two shapes of documentation. Pick the one that matches what you're doing.

| You want to… | Go to |
|---|---|
| **Use** Nexis — install, configure, keybindings, troubleshooting | **[wiki.nexisdev.org](https://wiki.nexisdev.org)** |
| **Understand** how a subsystem works, before changing it | **[architecture/](architecture/)** — narrative guides, readable on GitHub |
| **Navigate** the codebase — where does X live, what calls what | **[vault/](vault/Home.md)** — a linked map, best in Obsidian |
| Know **what shipped** | [CHANGELOG.md](../CHANGELOG.md) — the record |
| Know **what's planned** | [ROADMAP.md](../ROADMAP.md) — a to-do list, not a record |
| Avoid a **known landmine** | [CLAUDE.md](../CLAUDE.md) — invariants and pitfalls, authoritative |
| Add your own **AI agent tool** | [architecture/custom-ai-tools.md](architecture/custom-ai-tools.md) |
| Use or extend the **ML Lab** | [ML_LAB_GUIDE.md](ML_LAB_GUIDE.md) (user guide) · [ML_SUITE.md](ML_SUITE.md) (protocol + design record) |

## architecture/ vs vault/

They are not duplicates, and neither is a subset of the other.

**`architecture/`** explains *how a subsystem works and why it's shaped that way* — prose, diagrams, plain
markdown that renders correctly in the GitHub file browser. Read it to build a mental model. Five guides,
roughly in reading order:

1. [two-process-model.md](architecture/two-process-model.md) — the Rust core / webview split everything else sits on
2. [pty-shell-integration.md](architecture/pty-shell-integration.md) — terminal sessions, threads, shell integration
3. [terminal-renderer-pool.md](architecture/terminal-renderer-pool.md) — how many tabs stay cheap
4. [ai-subsystem.md](architecture/ai-subsystem.md) — the agent loop, tools, approval
5. [security-model.md](architecture/security-model.md) — what's trusted, what's gated, what's blocked

Plus one how-to guide:

- [custom-ai-tools.md](architecture/custom-ai-tools.md) — writing your own agent tool with `pnpm tool:new`

**`vault/`** is a navigational index — file-level maps, one-line-per-thing inventories, and cross-links.
Read it to find the right file fast. It uses Obsidian `[[wiki-links]]`, which GitHub renders as literal
text, so it's meant to be opened in a linking editor rather than browsed here. See
[Reading the vault in Obsidian](#reading-the-vault-in-obsidian) below.

The rule between them: architecture guides link *down* into the vault for file paths, and the vault links
*out* to `CLAUDE.md` for invariants. Nothing restates its source of truth — if you find a claim here that
contradicts the code, fix it or delete it. A stale map is worse than no map.

## Reading the vault in Obsidian

The vault is plain markdown with wiki-links and YAML frontmatter — no plugins, no custom syntax. Any tool
that understands those will do, but Obsidian gets you the graph view and backlinks that make it worth
opening.

1. Install [Obsidian](https://obsidian.md) (free for personal use).
2. **Open folder as vault**, and select `docs/vault/` inside your Nexis checkout — not the repo root.
3. That's it. `Home.md` is the entry point; use the graph view to see how subsystems connect.

Obsidian writes its per-user config into `docs/vault/.obsidian/`, which is gitignored — your workspace
layout, theme, and hotkeys stay yours and won't show up in a diff.

If you'd rather not install anything: every note is readable as-is in any text editor, and
[VS Code](https://marketplace.visualstudio.com/items?itemName=svsool.markdown-memo) and Neovim both have
wiki-link extensions that resolve `[[links]]` the same way.

## Contributing to the docs

- Adding an architecture guide: keep it narrative, keep it plain markdown (no wiki-links — these render on
  GitHub), and link to vault notes for file-level detail rather than inlining paths that will drift.
- Adding a vault note: read [vault/conventions.md](vault/conventions.md) first. Frontmatter is required,
  filenames are kebab-case, notes stay under ~100 lines.
- Changing behavior: the [CHANGELOG entry](../CLAUDE.md) is part of the change, not a follow-up.
