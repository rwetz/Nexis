# Asset Manifest

Everything in `assets/` and how it's wired up. Paths on the right are where the
file lives in a running app.

## Brand

| Asset | Ships to | Used by / how |
|---|---|---|
| `assets/logo.png` (512×512 RGBA) | `public/logo.png` | `<img src="/logo.png">` in Welcome screen, AI mini-window, About section. Also the **source for app icons** — feed to `pnpm tauri icon`. |
| `assets/AppLogo.tsx` | `src/components/AppLogo.tsx` | Inline SVG mark. Fills with `currentColor` (`text-foreground`), so it recolors with theme/context. Prefer this in-chrome; use `logo.png` where a raster is needed. |
| `assets/icons/icon-source.png` | — | Master 1024²-ish icon; regenerate the full platform set per app: `pnpm tauri icon assets/icons/icon-source.png`. |
| `assets/icons/installer-logo.png` | `src-tauri/icons/installer-logo.png` | Windows NSIS installer header image (`bundle.windows.nsis.headerImage`). |

> App icons are intentionally **not** shipped as a full set here — they're
> derived per-app from a single source so the identifier/rounding stays
> consistent. Only the source + installer header are kept.

## Cursors — the "Tailless Smooth" set

`assets/cursors/` → **copy wholesale to `public/cursors/`**. 32×32 PNGs, wired up
purely in `globals.css` (§5 of DESIGN_SYSTEM.md). No JS.

- 29 cursor PNGs: `arrow, pointer, text, text_h, wait, progress, help,
  crosshair, all_scroll, not_allowed, no_drop, grab, grabbing, col_resize,
  row_resize, ns_resize, ew_resize, nesw_resize, nwse_resize, zoom_in, zoom_out,
  copy, alias, cell, account, location, handwriting, drag_alias, drag_copy`.
- `hotspots.json` — the click-point `[x,y]` within each 32×32 image (read from
  the original `.cur` headers). The values baked into the `globals.css`
  `url(...) x y` rules are the authoritative ones the browser uses; this JSON is
  the catalog/reference.

**Coverage in CSS**: base `html` cursor = arrow; interactive roles
(`a,button,[role=…],select,summary,label[for],…`) = pointer; text inputs = text;
and **every Tailwind `.cursor-*` utility is overridden** to the matching PNG so
`className="cursor-col-resize"` just works. The override rules sit after the
Tailwind `@import` so cascade order wins.

To add a cursor: drop `foo.png` (32×32) in the folder, add its hotspot to
`hotspots.json`, and add a `.cursor-foo { cursor: url('/cursors/foo.png') x y, foo }`
rule (plus any role selector) in `globals.css`.

## Templates (not "assets" but shipped alongside)

See `templates/frontend/` (styles, lib, theme, components) and
`templates/config/` (vite, shadcn, tauri, html, main.tsx). SCAFFOLDING.md maps
each to its destination.
