---
type: subsystem
description: Every git repo on the machine, as a status list and an isometric map — one libgit2 scan, two views, one selection.
---

# Atlas

The Navigation sidebar panel that inventories **every git repo on this machine**: a status list (branch, ahead/behind, dirty counts, stashes, last commit) and an isometric map (repos as plots, files as buildings, height is lines of code), over a single scan and a shared selection.

Absorbed in v1.27.0 from the standalone `nexis-atlas` app, which was itself `nexis-imagine` + `nexis-dev-dashboard` merged. Its history is grafted into this repo, so `git log --follow` and `git blame` reach it. See [[absorbing-the-nexis-apps]].

Distinct from [[source-control]] territory: that panel is *this workspace's* repo, and it writes. Atlas is read-only and reads every repo it can find.

## Key files

- `src-tauri/src/modules/atlas/mod.rs` — the four commands (`atlas_scan_repos`, `atlas_repo_city`, `atlas_repo_detail`, `atlas_config_path`) and the module's own scope note
- `src-tauri/src/modules/atlas/config.rs` — `atlas.toml` loading, legacy-config adoption, repo discovery under `scan_root`
- `src-tauri/src/modules/atlas/scan.rs` — one walk + one `Repository::open` + one status pass per repo, fanned out with rayon
- `src-tauri/src/modules/atlas/tree.rs` — the per-repo file tree the map drills into
- `src/modules/atlas/AtlasPanel.tsx` — the panel shell, mode switch, scoped keymap, status line
- `src/modules/atlas/AtlasWindowActions.tsx` — List/Map, labels, and refresh controls shared by the panel toolbar and the standalone-like companion-window title bar
- `src/modules/atlas/repos/store.ts` — the shared scan/selection state and the config-bounded `showRepo` command-palette entrypoint
- `src/modules/atlas/repos/host.tsx` — the callbacks Atlas asks Nexis for (open workspace / terminal / file)
- `src/modules/atlas/map/CityCanvas.tsx`, `iso.ts`, `layout.ts`, `palette.ts` — the isometric renderer

## Invariants / gotchas

- **This panel answers about the host machine, always — including under a WSL workspace.** That is a deliberate exception to pitfall #20, not an oversight of it: Atlas is a machine-wide inventory, not a capability reported *on behalf of* the workspace, and re-rooting the scan when a terminal tab switches env would make the map jump for reasons unrelated to the map. The requirement pitfall #20 actually imposes — don't let a host-scoped answer pass as a workspace-scoped one — is met by the panel's status line saying "this machine". Scanning inside a distro is tracked in ROADMAP.
- **`git2` is linked for this panel and nothing else.** [[source-control]] drives the `git` CLI on purpose: a panel that writes must respect the user's config, credential helpers and hooks. A read-only sweep over every repo wants in-process reads and no process-per-repo. Do not "unify" these.
- **`git2` is pinned `default-features = false`.** Atlas never talks to a remote, so the ssh/https transports are pure size.
- **Use the fallible `git2` 0.21 APIs deliberately.** `Commit::summary`, `Reference::symbolic_target`, and `StatusEntry::path` can now report a libgit2 decoding failure; `scan.rs` degrades those individual display fields safely rather than treating them as infallible.
- **Config lives at `~/.config/nexis/atlas.toml`** (`%APPDATA%\nexis\atlas.toml`), deliberately a separate hand-edited file rather than keys in preferences — see the header comment in `config.rs`. `LEGACY_DIRS` adopts a config written by the standalone Atlas, Imagine, or Dev Dashboard on first open.
- **`scan_repos` must stay `async` + `heavy()`.** It walks the filesystem for every repo on the machine; sync would stall the Tauri main thread and every queued `pty_write`.
- **The scan sorts biggest-first in Rust.** `layoutAtlas`'s squarified treemap requires descending weight, and a stable order stops islands hopping between refreshes. The list view sorts its own rows.
- **The canvas palette is keyed on `paletteEpoch`, not just `themeId`.** Canvas cannot read CSS variables, so `palette.ts` probes computed style via `resolveCssColor`. `themeId` changes during the render that *requests* a theme, while the variables land in an effect — probing on the id alone reads the previous palette and stays wrong. `tintLanguageForTheme` then moves the language ramp toward `--brand` while preserving language separation, so any cross-window theme event visibly redraws an open city. See [[theming]].
- **A new city assembles once, but interaction stays immediate.** `CityCanvas` rises non-terrace blocks in a short deterministic wave after a new scene is fitted, while the terrain is drawn in full from the first frame. The renderer schedules only those 420ms of frames, then returns to on-demand drawing; it bypasses the effect under `prefers-reduced-motion`. Keep its scalar easing aligned with the house entry curve in [[icon-and-motion-system]].
- **LOC is measured only in a city view.** The machine-wide scan intentionally stays cheap and records bytes/files; opening one repo builds its tree and counts readable text lines. `projectStats.ts` derives the Inspector's clearly-labelled size signals from that real count, excluding binary and oversized files. Its solo-build, typing, and coffee numbers are perspective, never schedules.
- **The keymap is scoped to the panel subtree, not `window`.** The standalone app could claim bare `r`/`t`/`v`/`j`/`k` because the whole window was Atlas. Here the terminal is one pane away.
- **The companion window keeps Atlas's own title-bar controls; the embedded panel keeps its toolbar.** `ToolWindowShell` passes `standalone` to Atlas so controls do not appear twice. The map rails are proportional to their container, matching the standalone composition without hardcoding screen-width breakpoints.
- **The scoped keymap updates its host ref in an effect.** Do not assign `hostRef.current` during render: React may discard that render while the stable key handler survives.
- **Deep links are gone.** `nexis-atlas://focus?path=…` had nothing to link to once the two processes became one. If Nexis registers a URL scheme later, the old grammar is in this repo's history under `src-tauri/src/links.rs`.
- **"Show this repo in Atlas" refreshes before it opens.** The palette action switches to Atlas and calls `showRepo(explorerRoot)`, which opens only an exact path from the current configured scan. Do not bypass that check with a direct `enterRepo` call: the city command accepts a path and must stay reachable only through Atlas's admitted repository set.

## See also

- [[absorbing-the-nexis-apps]] — why this is a panel and not an app
- [[theming]] — `paletteEpoch` and the token probe
- [[icon-and-motion-system]] — what the vendored UI had to be brought onto
