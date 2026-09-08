---
type: subsystem
description: How Nexis hands the open workspace to the other apps in the family, and why that is a URL rather than a subprocess.
---

# Family links

Nexis is the view from inside one project. The sibling apps show the same
machine from other angles — [Atlas](https://github.com/rwetz/nexis-atlas) maps
every local repo at once — and a family link is how Nexis says "this repo,
over there". Links go out as custom-scheme URLs the sibling registers, so
Nexis holds no path to another binary, spawns nothing, and has nothing to keep
in sync beyond the verb.

As of 2026-09 there is exactly one: "Show this repo in Atlas" in the command
palette, sending `nexis-atlas://map?path=…`.

## Key files

- `src/lib/atlas.ts` — `atlasUrl` (builds the link) and `showInAtlas` (opens it)
- `src/lib/atlas.test.ts` — pins the encoding round trip
- `src/app/App.tsx:paletteCommands` — the `atlas.showRepo` entry
- `src-tauri/capabilities/default.json` — the `opener:allow-open-url` scope entry

## Invariants / gotchas

- **The opener scope is not optional, and failing it looks like nothing
  happening.** `tauri-plugin-opener`'s `opener:default` permission carries a
  scope allowing only `mailto:`, `tel:`, `http://` and `https://`. A custom
  scheme is rejected before it reaches the OS, so any new family link needs its
  scheme added to the `opener:allow-open-url` entry in the capability — scoped
  to that scheme, never widened to `*`.
- **Percent-encode the path; never interpolate it.** A Windows path is mostly
  backslashes and often holds a space, and a path containing `&`, `#` or `?`
  silently truncates when read back. `atlasUrl` handles this; the test pins it.
- **A link is a request, not a command.** The receiving app validates the URL
  and decides what to do. Atlas only ever selects a repo it already scanned, so
  a link cannot make it read new directories. Keep that property in any sibling.
- **Nothing detects whether the sibling is installed.** If it is not, the OS has
  no handler and `openUrl` rejects; the caller surfaces that. Probing for an
  install would mean holding a binary path that goes stale on every upgrade.

## Debugging entry points

- Command runs, nothing opens → check the capability scope first (above), then
  whether the sibling registered its scheme (on Windows,
  `HKCU:\Software\Classes\<scheme>`).
- Sibling opens but lands on the wrong repo → the path sent is `explorerRoot`,
  which is the workspace root, not the active terminal's cwd.

## Related

[[window-chrome]] · [[ml-lab]]
