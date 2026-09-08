# `_design` — Tauri + React Design Blueprint

A self-contained, **replicable blueprint** for the visual/interaction design
shared across my Tauri desktop apps. Extracted from **Nexis** — the reference
implementation and canonical source of the design language.

> **Nexis is the blueprint.** When Nexis and this folder disagree, Nexis wins —
> re-extract. This folder is a snapshot + generalized guide, not a live fork.

## What's here

```
_design/
├─ README.md              ← you are here (index + philosophy)
├─ DESIGN_SYSTEM.md       ← the full design language (color, type, motion,
│                            cursors, window chrome, theme engine, components)
├─ SCAFFOLDING.md         ← step-by-step: stand up a new Tauri app with all of it
├─ PITFALLS.md            ← ⚠ real-world failures + fixes (Linux/NVIDIA chrome,
│                            View Transitions, resize cursors, pnpm, logo) —
│                            read alongside SCAFFOLDING.md
├─ ASSETS.md              ← manifest of copied assets + how each is used
├─ assets/
│  ├─ logo.png            ← 512×512 brand logo (raster)
│  ├─ AppLogo.tsx         ← inline SVG logo (recolors via currentColor)
│  ├─ icons/              ← icon source + installer header (regen per-app via `tauri icon`)
│  └─ cursors/            ← the bespoke "Tailless Smooth" cursor set (29 PNGs + hotspots.json)
└─ templates/
   ├─ frontend/           ← drop-in design source (styles, lib, theme, components)
   │                        styles/globals.css     = generic (any Tauri app) ← default
   │                        styles/globals.ide.css = full (adds terminal + code-editor rules)
   └─ config/             ← vite / shadcn / tauri / html / main.tsx templates
```

> **CSS:** use `globals.css` for any app. Only swap in `globals.ide.css` if you
> embed a terminal (xterm) or code editor (CodeMirror). Both share an identical
> design core; the IDE version just adds those consumers' rules back.

## How to use it

1. Read **DESIGN_SYSTEM.md** to understand the language (what the design *is*).
2. Follow **SCAFFOLDING.md** to bootstrap a new app (how to *reproduce* it) —
   with **PITFALLS.md** open next to it; several steps have known traps
   (Linux window chrome, NVIDIA rendering, theme crossfade) that the templates
   alone won't warn you about.
3. Copy files straight out of `templates/` and `assets/` into the new project.

## The design in three sentences

Clean glass surfaces over a neutral **OKLCH** grayscale, lifted by a single
**coral `--brand` accent** that carries all identity (CTAs, active states, the
"alive" agent indicator) and recolors with the active theme. The app paints its
**own borderless window chrome** on Windows/Linux (native traffic lights on
macOS), ships a **bespoke cursor set**, and swaps themes at runtime by writing
CSS variables — crossfading the whole window through the **View Transitions
API**. Typography is self-hosted **Inter** (UI) + **JetBrains Mono** (code), all
motion speaks one shared spring/tween **vocabulary** that respects reduced-motion
globally.

## Stack

Tauri v2 · React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS v4 (CSS-first)
· shadcn/ui + Radix · Hugeicons · Motion · ogl · Zustand · Sonner · OKLCH color.

## Provenance

Extracted from `github.com/rwetz/Nexis` @ `main` on 2026-07-07. Every value in
the docs is lifted from the real source, not invented.
