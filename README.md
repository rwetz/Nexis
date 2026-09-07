# Imagine

An isometric view of every git repo on your machine.

Two scenes, one renderer:

- **Atlas** — each repository is a plot on a plate, with a tower per language
  you write in. Plot size is how many files it holds, tower height is how much
  code that language holds, and a coral tint means the working tree is dirty.
  Plots fade toward the haze as their last commit recedes, so what you are
  actually working on is the brightest thing on the board.
- **City** — walk into a repo and its file tree becomes a city: directories are
  terraces, files are buildings. Footprint is how much sits inside, **height is
  lines of code**, colour is language, and coral means git has something to say
  about that file.

Height is code and only code. Images, binaries, fonts and lockfiles are laid
out as low pads in a near-neutral grey, and in the atlas they collapse into a
single `Assets` district — otherwise the tallest thing in a typical repo is a
PNG, and the atlas becomes a map of where the screenshots live. Language hues
are spread as far apart as one OKLCH ring allows, with the coral wedge left
empty so nothing can be mistaken for working-tree state; files too small on
screen to show a coral outline get a coral pin instead, so uncommitted work is
visible from the fitted camera.

Everything is read-only. Nothing is written anywhere except the config file.

Built on the [Nexis design blueprint](../nexis-dev-dashboard/_design) — Tauri v2,
React 19, Tailwind v4, OKLCH tokens, borderless chrome, the bespoke cursor set,
and a runtime-swappable theme engine.

## Running it

```bash
pnpm install
pnpm tauri dev
```

The dev server wants port `1420`, same as every other app in the family — only
one of them can be running at a time.

```bash
pnpm tauri build      # installers/bundles
```

## Configuration

First run writes `config.toml` into the platform config dir
(`%APPDATA%\nexis-imagine\` on Windows, `~/.config/nexis-imagine/` elsewhere).
The gear in the status bar opens it.

```toml
repos = []            # explicit paths, always included (tilde expanded)
scan_root = "~/Dev"   # walked for directories containing .git
scan_depth = 3
max_files = 20000     # per-repo cap, so one monorepo cannot wedge the canvas
```

Hidden directories, `node_modules`, `target`, `vendor`, `dist`, `build`,
`__pycache__` and virtualenvs are always skipped, and `.gitignore` is honored
via libgit2 — the city shows what git considers part of the project.

## Controls

| | |
|---|---|
| drag | pan |
| wheel | zoom to cursor |
| click | select |
| double-click | enter a repo / zoom to a building |
| `q` / `e` | rotate a quarter turn, keeping your zoom |
| `f` | fit the scene |
| `l` | toggle labels |
| `r` | rescan |
| `Esc` | back to the atlas |

## Layout

```
src/
  app/App.tsx              shell: header, panes, status bar
  components/              AppLogo, WindowControls, ResizeHandles, ui/
  lib/                     utils, platform, motion
  modules/city/
    api.ts  store.ts  types.ts     Tauri bridge + Zustand state
    layout.ts                      squarified treemap -> boxes
    iso.ts                         projection, painter order, drawing, picking
    palette.ts                     theme tokens -> canvas colours, language ramp
    CityCanvas.tsx                 camera, pointer, draw loop
    RepoList / Inspector / Legend / StatusBar
  modules/theme/           theme engine (mode + themeId, View-Transition crossfade)
  styles/                  globals.css, fonts.css, tokens.ts
src-tauri/src/
  config.rs                config.toml + repo discovery
  walk.rs                  the one filesystem walk both views share
  scan.rs                  per-repo git + size aggregates (the atlas)
  tree.rs                  nested tree with real line counts (the city)
  lang.rs                  extension -> language
```

A headless version of the same data, for debugging without the GUI:

```bash
cd src-tauri
cargo run --example scan                     # every configured repo
cargo run --example scan ~/Dev/some-repo     # one repo's top directories
```

Line counts cover code, docs and config only. Lockfiles, binaries, images and
fonts are never read — the renderer sizes them by bytes, so counting their
lines would be I/O for a number nothing uses.
