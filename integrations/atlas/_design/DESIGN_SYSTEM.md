# Nexis Design System — Reference

> The complete design language extracted from **Nexis**, a Tauri v2 + React 19 desktop
> app. This is the canonical description of the visual system. Every value here is
> lifted from the real codebase, not invented. Use it as the source of truth when
> building any new Tauri app in this family.

---

## 0. Stack at a glance

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Tauri v2** | `identifier` reverse-DNS, custom borderless chrome on Win/Linux, native overlay title bar on macOS |
| UI runtime | **React 19** + TypeScript (strict) | `react-dom/client`, top-level `await` in `main.tsx` |
| Bundler | **Vite 7** | `@vitejs/plugin-react`, manual chunk splitting |
| Styling | **Tailwind CSS v4** | CSS-first config (no `tailwind.config.js`), `@tailwindcss/vite` plugin |
| Components | **shadcn/ui** (`radix-luma` style) + **Radix UI** primitives | `components.json` drives generation |
| Icons | **Hugeicons** (`@hugeicons/react` + core-free-icons) | `iconLibrary: "hugeicons"` in shadcn config |
| Motion | **Motion** (`motion/react`, ex-Framer Motion) | shared spring/tween vocabulary |
| WebGL FX | **ogl** | lazy-loaded animated backgrounds (Aurora/Particles/Threads) |
| State | **Zustand** | one store per module |
| Toasts | **Sonner** | |
| Fonts | **Inter Variable** (UI) + **JetBrains Mono** (code/terminal) | self-hosted via `@fontsource*` |
| Color model | **OKLCH** everywhere | perceptually-uniform, better dark-mode ramps |

The design philosophy, in one line: **a clean glass surface over neutral OKLCH
grays, with a single coral brand accent, custom window chrome, a bespoke cursor
set, and a runtime-swappable theme engine that crossfades via the View
Transitions API.**

---

## 1. Color system

### 1.1 Everything is OKLCH

All color tokens are declared in `oklch(L C H)` form. `L` = lightness 0–1,
`C` = chroma, `H` = hue degrees. This gives even perceptual steps across the
neutral ramp and clean `color-mix()` blends.

Because xterm.js (WebGL) and CodeMirror's static theme builder **cannot** consume
`oklch()` directly, `styles/tokens.ts` resolves each CSS variable to a concrete
`rgb()` string at runtime by painting it on a hidden probe `<div>` and reading
`getComputedStyle().color`. **Keep this pattern** any time a non-CSS consumer
(canvas, WebGL, a charting lib) needs a theme color.

### 1.2 The token contract (shadcn base)

Defined in `styles/globals.css` under `:root` (light) and `.dark` (dark). Every
component references these — never hardcode a hex in a component.

```
--background / --foreground        page surface + text
--card / --card-foreground         raised surfaces (panels, popovers base)
--popover / --popover-foreground   floating menus
--primary / --primary-foreground   solid buttons, high-emphasis
--secondary / …                    low-emphasis fills
--muted / --muted-foreground       subtle bg + dimmed text
--accent / --accent-foreground     hover fills, selected rows
--destructive                      errors, dangerous actions
--border / --input / --ring        hairlines, field borders, focus ring
--sidebar* (8 tokens)              sidebar-specific palette
--chart-1..5                       data-viz ramp
--radius: 0.625rem                 base radius (see §4)
```

Dark-mode borders/inputs use **alpha white** (`oklch(1 0 0 / 10%)`,
`/ 15%`) rather than a solid gray — hairlines that read correctly over any
surface.

### 1.3 The brand accent — the one non-neutral color

The base palette is intentionally neutral grayscale. **One** accent carries all
brand identity:

```css
--brand: oklch(0.72 0.15 35);      /* coral / salmon */
--brand-foreground: oklch(1 0 0);
```

**Rules for `--brand`** (documented inline in `globals.css`):
- ✅ Primary CTAs, active/selected states, the AI-agent "alive" indicator, the
  sliding tab indicator, active-pane focus glow.
- ❌ Not for links, not for decorative flourishes.

`--brand` is theme-aware: `applyTheme()` re-points it at the active theme's
`ring` (falling back to `primary`) so the whole accent system recolors with the
theme. The default theme leaves it as the coral above.

Three reusable primitives are keyed off `--brand` (in `globals.css`):
- `.brand-glow` — soft focus/active glow (`box-shadow` with `color-mix`).
- `.pane-focus-ring` — inset ring + inner glow drawn as a pointer-events-none
  overlay **on top of** pane content (so an opaque terminal canvas can't paint
  over it).
- `.aurora-border` — animated conic-gradient border traced around an element
  (used on the AI panel while an agent streams). Uses an `@property
  --aurora-angle` so the angle is animatable, plus `mask-composite` to show only
  the 1px edge. Has a `prefers-reduced-motion` static fallback.

### 1.4 Terminal ANSI palette

A parallel set of `--terminal-*` variables (16 ANSI colors + bg/fg/cursor/
selection) live in `globals.css` and are overridden per-theme by `applyTheme()`.
`tokens.ts::readTerminalTokens()` resolves them to rgb for xterm.

---

## 2. Typography

### 2.1 Two families, self-hosted

| Role | Family | Loaded via |
|---|---|---|
| UI / headings | **Inter Variable** (`100–900` weight axis) | `styles/fonts.css` `@font-face` pointing at `@fontsource-variable/inter` woff2 |
| Code / terminal | **JetBrains Mono** (400 + 700) | imported in `main.tsx` from `@fontsource/jetbrains-mono` |

`@theme inline` in `globals.css` wires `--font-sans` and `--font-heading` to
Inter. `fonts.css` subsets Inter to **latin + cyrillic only** via `unicode-range`
to cut payload. `font-display: swap` throughout.

### 2.2 Nerd Font detection (terminal)

`lib/fonts.ts` walks a candidate list of installed Nerd Fonts
(`JetBrainsMono Nerd Font`, `FiraCode Nerd Font`, `MesloLGS NF`, …) using
`document.fonts.check()` and returns the first available, falling back to
`"JetBrains Mono", SFMono-Regular, Menlo, monospace`. This lets the terminal use
glyph-rich fonts when the user has them, without bundling them. `ensureMonoFontsLoaded()`
pre-loads the bundled weights before first terminal paint.

---

## 3. Motion vocabulary

`lib/motion.ts` defines a **shared** set of transitions so no component invents
its own stiffness/damping:

```ts
spring.snappy  { stiffness: 480, damping: 36 }   // toggles, active indicators, small moves
spring.smooth  { stiffness: 220, damping: 30 }   // general panel/list motion
spring.gentle  { stiffness: 140, damping: 24 }   // large soft entrances (sheets, docking panels)

tween.fast  { duration: 0.12, ease: easeOut }    // opacity/color fades
tween.base  { duration: 0.20, ease: easeOut }
tween.slow  { duration: 0.34, ease: [0.22,1,0.36,1] }
```

**Reduced motion is global**: the app root wraps everything in
`<MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}>` (see
`App.tsx`), so every Motion animation auto-disables for users who prefer reduced
motion. CSS animations (`.aurora-border`, collapsibles, theme crossfade) each
carry their own `@media (prefers-reduced-motion: reduce)` fallback.

Theme switches animate through the **View Transitions API**
(`ThemeProvider.withViewTransition`): `document.startViewTransition(() =>
flushSync(mutate))` crossfades the whole window between palettes over `0.25s`,
degrading to a hard cut where the API is missing or reduced-motion is set.

---

## 4. Radius scale

One base variable drives a full geometric scale (in `@theme inline`):

```
--radius: 0.625rem            (10px, the knob)
--radius-sm  = radius * 0.6   --radius-lg = radius
--radius-md  = radius * 0.8   --radius-xl = radius * 1.4
--radius-2xl = radius * 1.8   --radius-3xl = radius * 2.2   --radius-4xl = radius * 2.6
```

Buttons use `rounded-4xl` (pill-ish); cards/popovers use the mid range. Change
`--radius` once to re-tune the whole app's roundness. Borderless window corners
are a fixed `12px` (see §6).

---

## 5. Custom cursor set ("Tailless Smooth")

A full bespoke cursor set lives in `public/cursors/` (32×32 PNGs) and is wired up
entirely in CSS (`globals.css`), not JS:

- `html { cursor: url('/cursors/arrow.png') 5 5, default }` sets the base arrow;
  every native fallback is preserved after the comma.
- Interactive roles (`a, button, [role="button"], [role="tab"],
  [role="menuitem"], [role="checkbox"], select, summary, label[for], …`) →
  `pointer.png`.
- Text inputs / `contenteditable` → `text.png`.
- **Every Tailwind cursor utility is overridden** (`.cursor-grab`,
  `.cursor-col-resize`, `.cursor-zoom-in`, …) so `className="cursor-col-resize"`
  transparently uses the custom PNG. These rules sit *after* the Tailwind import
  so cascade order wins.

Hotspot coordinates (the "click point" within each 32×32 image) are the numbers
after each `url()` and are catalogued in `public/cursors/hotspots.json`. When
adding a cursor, read the hotspot from the original `.cur` header.

> **Ship the whole `assets/cursors/` folder into every app's `public/cursors/`.**
> It's the single most recognizable piece of the brand's "feel."

---

## 6. Window chrome (the "custom frame")

This is the signature structural move. The app draws its **own** window frame on
Windows/Linux and keeps native traffic lights on macOS.

### 6.1 Platform decision (`lib/platform.ts`)

```ts
USE_CUSTOM_WINDOW_CONTROLS = !IS_MAC && platform() !== ""
```

macOS → native overlay title bar (traffic lights kept). Windows/Linux → we render
our own min/max/close.

### 6.2 Tauri config

- `tauri.conf.json`: main window `titleBarStyle: "Overlay"`, `hiddenTitle: true`,
  `visible: false` (starts hidden — see §6.4).
- `tauri.windows.conf.json` (Windows override): `decorations: false`,
  `transparent: true`, `shadow: false` — a truly borderless, transparent window
  that we paint ourselves.

### 6.3 We paint the frame in CSS

`main.tsx` sets `document.documentElement.dataset.chrome = "borderless"` when
`USE_CUSTOM_WINDOW_CONTROLS`. Then `globals.css`:

```css
html[data-chrome="borderless"], html[data-chrome="borderless"] body { background: transparent !important; }
html[data-chrome="borderless"] #root { height:100%; border-radius:12px; overflow:hidden; background:var(--background); }
```

So the OS gives a transparent borderless window and we render the rounded 12px
corners + surface ourselves — looks correct on GNOME/KDE/Hyprland/Windows.

### 6.4 No-flash startup

The window is created **hidden**. `main.tsx` renders React, then calls
`getCurrentWindow().show()` on a `setTimeout(…, 50)` (rAF is throttled while
hidden), with a 500ms safety re-show. This means the user never sees a
transparent shadow-only frame before React's first paint. `index.html` also runs
a tiny inline script that reads the persisted theme from `localStorage` and sets
`documentElement` class + background color **before** the bundle loads, killing
the light/dark flash.

### 6.5 Drag regions

Draggable chrome uses Tauri's `data-tauri-drag-region` attribute (see
`modules/header/Header.tsx` — the 40px header bar, spacer divs, and tab bar
background all carry it). Interactive children call `stopPropagation` so clicks
aren't swallowed by the drag region.

### 6.6 Window controls component

`components/WindowControls.tsx` renders min/max/close as 28px icon buttons
(Hugeicons), returns `null` on macOS, tracks maximized state via `onResized`,
and the close button gets a `hover:bg-destructive/15` danger treatment.

---

## 7. "Glass" surfaces & the SurfaceLayer

The app reads as layered glass:
- Panels use `bg-card` / `bg-popover` with `border-border/60` hairlines and,
  where floating, `backdrop-blur` (used in ~17 components — AI panels, pickers,
  overlays).
- A single **`SurfaceLayer`** (`modules/theme/SurfaceLayer.tsx`) renders an
  optional full-window background *behind* everything via a `createPortal` to
  `document.body` at a very high `z-index`, `pointer-events:none`. It supports:
  - **Animated WebGL backgrounds** (`aurora` / `particles` / `threads`),
    lazy-loaded from `components/ui/backgrounds/*` so `ogl` stays off the
    critical path. Colors are derived from the theme's primary hex (with tonal
    `lightenHex` variants).
  - **Image backgrounds** with opacity + blur, GIF/APNG/WebP aware, that suspend
    animation while the window is resizing or hidden (perf).
- `BG_OPACITY_RENDER_FACTOR` scales user opacity to a tasteful render range.

Keep `SurfaceLayer` mounted once, high in the tree (it's rendered inside
`ThemeProvider`).

---

## 8. Component conventions (shadcn / CVA)

- Components live in `components/ui/*`, generated by shadcn (`radix-luma` style,
  base color `mist`, `cssVariables: true`, no prefix).
- Variants use **class-variance-authority** (`cva`). See `button.tsx`:
  variants `default | outline | secondary | ghost | destructive | link`; sizes
  `default | xs | sm | lg | icon | icon-xs | icon-sm | icon-lg`.
- Every component sets `data-slot`, `data-variant`, `data-size` attributes for
  styling hooks and testability.
- `asChild` via Radix `Slot` for polymorphism.
- `cn()` (`lib/utils.ts`) = `twMerge(clsx(...))` — the universal className merger.
- Focus is always `focus-visible:ring-3 ring-ring/30` + `border-ring`. Buttons
  nudge `active:translate-y-px` for tactile press.
- Icons: **Hugeicons** via `<HugeiconsIcon icon={...} size={} strokeWidth={2} />`.

---

## 9. Theme engine (runtime-swappable)

Files: `modules/theme/{types,applyTheme,ThemeProvider,themes/*}.ts(x)`.

- A **`Theme`** = `{ id, name, variants: { light?, dark? } }` where each variant
  is `{ colors?: ThemeColors, terminal?: TerminalPalette }` plus optional
  `editorTheme` (CodeMirror theme id per mode).
- `applyTheme(theme, mode)` writes the variant's colors onto
  `document.documentElement.style` as the `--background`, `--foreground`, …
  variables (mapping camelCase → `--kebab`), sets `--brand` from `ring ?? primary`,
  and writes the 16 ANSI terminal vars. `clearTheme()` removes them so the
  default (globals.css) shows through.
- **10 built-in themes**: `nexis-default`, `claude`, `tokyo-night`, `nord`,
  `tide`, `sage`, `catppuccin`, `gruvbox`, `rose-pine`, `caffeine`. Plus
  user **custom themes** loaded from disk (`customThemes.ts`).
- `ThemeProvider`:
  - Mode = `light | dark | system`; resolves `system` via
    `matchMedia("(prefers-color-scheme: dark)")` with a live listener.
  - **Fast-path**: mirrors mode + themeId into `localStorage`
    (`nexis-ui-theme-shadow`, `nexis-ui-theme-id-shadow`) so `index.html` can
    apply them before the bundle loads (no flash), then hydrates the real
    persisted prefs from the Tauri store.
  - All theme changes route through `withViewTransition` for the crossfade.
- `example-theme.ts` (Tokyo Night) is included as a copy-paste starting point.

---

## 10. App shell anatomy (layout)

From `App.tsx`, top to bottom, the provider/layout stack is:

```
<AiComposerProvider>            (app-specific; drop for non-AI apps)
  <ThemeProvider>               (renders <SurfaceLayer/> + theme context)
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <div class="…root…">
          <Header/>             (40px, data-tauri-drag-region, tabs + window controls)
          <main class="zoom-content flex-1">
            <ResizablePanelGroup>   (react-resizable-panels)
              <SidebarRail/>        (icon rail — activity-bar style)
              <ErrorBoundary> …workspace panels… </ErrorBoundary>
            </ResizablePanelGroup>
          </main>
          <StatusBar/>          (bottom bar)
          …overlays: CommandPalette, QuickFilePicker, dialogs…
        </div>
        <Toaster/>              (Sonner)
```

Key structural utilities in `globals.css`:
- `.zoom-content { zoom: var(--app-zoom) }` + `.zoom-exempt { zoom: calc(1/var(--app-zoom)) }`
  — app-wide UI zoom (Ctrl±) that individual regions can opt out of.
- Native scrollbars are **globally killed** (`scrollbar-width:none` etc.); visible
  scroll affordances come from shadcn `<ScrollArea>` or the opt-in
  `.nexis-scrollbar` (3px thin, `color-mix` thumb) / `.no-scrollbar` helpers.
- xterm.js and CodeMirror scrollbars are explicitly hidden (rules kept outside
  `@layer` so they beat the addon stylesheets).
- `body { overflow: hidden }` — the app owns all scrolling.

---

## 11. What makes it feel like *this* family (the checklist)

If a new app has these, it belongs to the family:

1. OKLCH neutral palette + **one** coral `--brand` accent, theme-aware.
2. Inter (UI) + JetBrains Mono (code), self-hosted, subsetted.
3. Custom borderless chrome on Win/Linux, native on macOS; 12px window corners;
   hidden-until-painted startup; no theme flash.
4. The bespoke **cursor set** in `/public/cursors`.
5. Shared **motion vocabulary** + global reduced-motion + View-Transition theme
   crossfade.
6. shadcn/Radix components via CVA + `cn()`, Hugeicons.
7. A one-instance **SurfaceLayer** for optional glass/animated backgrounds.
8. Runtime theme engine writing CSS vars, with a localStorage fast-path.
9. Killed native scrollbars; `<ScrollArea>` / `.nexis-scrollbar` for the rest.
10. The signature `--brand` primitives: `.brand-glow`, `.pane-focus-ring`,
    `.aurora-border`.

See **SCAFFOLDING.md** to stand a new app up with all of the above.
