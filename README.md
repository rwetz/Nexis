# Atlas

Every git repo on your machine, scanned once and shown two ways.

- **List** — branch, sync state, changed files, last commit and stashes for
  every repo, in one table, instead of `cd`-ing into each one. Select a row for
  its changed-file list, stashes and full commit info.
- **Map** — the same repos as an isometric scene. In the *atlas* each repo is a
  plot on a plate with a tower per language you write in: plot size is how many
  files it holds, tower height is how much code that language holds, and a
  coral tint means the working tree is dirty. Walk into one and its file tree
  becomes a *city*: directories are terraces, files are buildings, footprint is
  how much sits inside, **height is lines of code**, colour is language, and
  coral means git has something to say about that file.

The two views share one scan, one config and one selection: pick a repo in the
list, press `v`, and it is the one the map has marked. Drill into a city and
switch back, and the list is already on that row.

Height is code and only code. Images, binaries, fonts and lockfiles are laid
out as low pads in a near-neutral grey, and in the atlas they collapse into a
single `Assets` district — otherwise the tallest thing in a typical repo is a
PNG, and the atlas becomes a map of where the screenshots live. Language hues
are spread as far apart as one OKLCH ring allows, with the coral wedge left
empty so nothing can be mistaken for working-tree state; files too small on
screen to show a coral outline get a coral pin instead, so uncommitted work is
visible from the fitted camera.

Everything is read-only. Nothing is written anywhere except the config file.

Built on the [Nexis design blueprint](_design) — Tauri v2, React 19, Tailwind
v4, OKLCH tokens, borderless chrome, the bespoke cursor set, and a
runtime-swappable theme engine. Git scanning is native Rust via `git2` and
`rayon`; ten repos including the full filesystem walk take ~270 ms.

## Running it

```bash
pnpm install
pnpm tauri dev
```

```bash
pnpm tauri build      # installers/bundles
```

## Configuration

First run writes `config.toml` into the platform config dir
(`%APPDATA%\nexis-atlas\` on Windows, `~/.config/nexis-atlas/` elsewhere). The
gear in the status bar opens it. If you ran either of the apps Atlas replaces,
their config is adopted on first run rather than making you point `scan_root`
at the same directory again.

```toml
repos = []            # explicit paths, always included (tilde expanded)
scan_root = "~/Dev"   # walked for directories containing .git
scan_depth = 3
max_files = 20000     # per-repo cap, so one monorepo cannot wedge the canvas
```

Hidden directories, `node_modules`, `target`, `vendor`, `dist`, `build`,
`__pycache__` and virtualenvs are always skipped, and `.gitignore` is honored
via libgit2 — the map shows what git considers part of the project.

## Controls

Both views:

| | |
|---|---|
| `v` | switch between list and map |
| `r` | rescan |
| `t` | open your terminal at the selected repo |
| `o` | open the selected repo's folder |

List:

| | |
|---|---|
| `j` / `k` / arrows | move selection |
| `Enter` | toggle the detail pane |
| `Esc` | close the detail pane |
| double-click | toggle the detail pane |

Map:

| | |
|---|---|
| drag | pan |
| wheel | zoom to cursor |
| click | select |
| double-click | enter a repo / zoom to a building |
| `q` / `e` | rotate a quarter turn, keeping your zoom |
| `f` | fit the scene |
| `l` | toggle labels |
| `Esc` | back to the atlas |

## Family links

Atlas registers `nexis-atlas://`, so anything on the machine can point it at a
repo. Two verbs, one argument:

```bash
nexis-atlas://focus?path=C:\Users\me\Dev\thing   # select it in the list
nexis-atlas://map?path=/home/me/dev/thing        # open its city on the map
```

A link only ever *selects* something Atlas already scanned — the path is matched
against the repo list, never handed to the backend, so no link can make Atlas
read a directory it would not otherwise have looked at. A path *inside* a repo
resolves to that repo (senders often know a working directory long before they
know which repo contains it), with the innermost match winning so a submodule
beats its parent. An unknown path triggers one rescan (the usual reason is a
repo added since the last one) before it gives up. URLs are parsed and validated in Rust before the webview sees them; the
grammar and its tests live in [`src-tauri/src/links.rs`](src-tauri/src/links.rs).

If Atlas is already running, the link goes to the running copy and raises it,
rather than starting a second one.

Going the other way, the detail pane and the map inspector offer **Open in
Nexis**, which launches [Nexis](https://github.com/rwetz/Nexis) with the repo as
its workspace. That uses Nexis's existing launch-argument contract rather than a
`nexis://` URL, because Nexis does not register a scheme yet — when it does,
this becomes a one-line change. The button is hidden when no Nexis is installed;
set `NEXIS_BIN` to point at a specific binary.

## Layout

```
src/
  app/App.tsx              shell: header, mode switch, panes
  app/StatusBar.tsx        one bar, speaking for whichever view is up
  components/              AppLogo, WindowControls, ResizeHandles, ui/
  lib/                     utils, platform, motion, time
  modules/repos/           the shared data layer both views read
    types.ts                 serde mirrors + derived repo state
    api.ts                   Tauri bridge
    store.ts                 one store: scan, mode, shared selection, both views
  modules/list/
    RepoTable.tsx            the table
    DetailPanel.tsx          changed files, stashes, commit — and "Show on map"
  modules/map/
    layout.ts                squarified treemap -> boxes
    iso.ts                   projection, painter order, drawing, picking
    palette.ts               theme tokens -> canvas colours, language ramp
    CityCanvas.tsx           camera, pointer, draw loop
    RepoList / Inspector / Legend
  modules/theme/           theme engine (mode + themeId, View-Transition crossfade)
  styles/                  globals.css, fonts.css, tokens.ts
src-tauri/src/
  config.rs                config.toml, repo discovery, legacy config adoption
  links.rs                 the nexis-atlas:// grammar (parsed + validated here)
  nexis.rs                 finding and launching Nexis
  walk.rs                  the one filesystem walk both views share
  scan.rs                  the one scan: git state + size aggregates per repo
  tree.rs                  nested tree with real line counts (the city)
  detail.rs                changed files + stashes (the list's drill-in)
  lang.rs                  extension -> language
```

A headless version of the same data, for debugging without the GUI:

```bash
cd src-tauri
cargo run --example scan                     # every configured repo
cargo run --example scan ~/Dev/some-repo     # one repo's top directories
```

## Provenance

Atlas is the merge of two apps that turned out to be two views of one dataset:
nexis-imagine (the isometric map) and
[nexis-dev-dashboard](https://github.com/rwetz/nexis-dev-dashboard) (the git
status list). They had the same config shape, the same dependency set and the
same parallel libgit2 scan; keeping them apart meant walking every repo twice
and maintaining two copies of the same chrome. Both histories are preserved in
this repository.

## License

[Apache-2.0](LICENSE), matching [Nexis](https://github.com/rwetz/Nexis), whose
design system `_design/` is extracted from.
