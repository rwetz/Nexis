---
type: subsystem
description: The semantic icon choke point, the house size scale, and the terminal-derived motion tokens — what every glyph and transition in the UI goes through.
---

# Icon & motion system

Two surfaces that used to be per-call-site decisions and are now systems. **Icons** resolve through one module that maps app vocabulary onto a vendor's glyphs, so the vendor is swappable and one idea renders as one glyph. **Motion** resolves through CSS tokens wired into Tailwind's transition defaults, so timing is a property of the app rather than of whichever utility a component happened to type.

Both exist for the same reason, recorded as AGENTS.md pitfall #18: a UI assembled from library defaults is indistinguishable from every other UI assembled from the same defaults. The design brief was to stop inheriting and start deciding.

## Icons

Call sites write `<Icon name="close" />`. They never name a vendor, never import one, and never pick a raw pixel size.

- **Semantic names.** `REGISTRY` in `src/components/icon.tsx` maps names (`"refresh"`, `"git-branch"`, `"symbol-function"`) to Phosphor components. One key per concept — adding a second name for an idea that already has one is the exact drift this prevents.
- **Size scale.** `ICON_SIZE` — `xs` 12 / `sm` 14 (default) / `md` 16 / `lg` 20 / `xl` 24. A raw number is accepted for genuinely bespoke cases; prefer adding a step.
- **Weight as state.** Phosphor ships six weights from one package. `regular` rests, `fill` marks active. Pass `active`, not `weight`.
- **Accessibility.** The glyph is `aria-hidden` unless the call site gives it a name of its own — icon-only buttons label the *button*, so labelling both reads the action twice.

Three things are deliberately **not** in the registry:

- **Provider brand marks** (`src/settings/components/providerMarks.ts`) — nine AI-provider logos as raw path data from simple-icons (CC0-1.0). Embedded rather than depended on; see the note in that file for why `@lobehub/icons` was rejected. `ProviderIcon` falls back to a registry glyph for providers with no available mark.
- **File-type icons** — a different problem with a different source; see below.
- **The brand mark itself** — `public/nexis-logo.png`, not an icon.

## File-type icons

`src/modules/explorer/lib/iconResolver.ts` resolves a filename or folder name to *art* (an SVG body plus its viewBox), and `lib/FileTypeIcon.tsx` inlines that art into the document.

Resolution order is unchanged from before the retint: catppuccin by filename → by extension (walking compound extensions) → by language id, then a pruned vscode-icons `folder-type-*` set for ecosystems catppuccin lacks, then a default. Both sets are lazy-loaded as `?url` assets and parsed natively rather than compiled into JS chunks.

What is new is that catppuccin's art is **retinted onto the active theme** — see [[theming]] for the invariant and the failure mode. The short version: the art has 19 baked-in hexes that no Nexis theme could reach, they are mapped onto the theme's own `--terminal-ansi-*` roles, and that is only possible because the art is inlined rather than served as a `data:` URL.

## Motion

Tokens live in `:root` in `src/styles/globals.css`:

- `--ease-exit` / `--ease-enter` — asymmetric. Leaving accelerates away, arriving decelerates hard into place. Neither overshoots; nothing in a tool should bounce.
- `--dur-tap` 90ms / `--dur-panel` 140ms / `--dur-window` 200ms / `--dur-scene` 420ms — scaled by how far the element actually travels. The scene budget is only for a data visualization or completed work arriving; do not use it for a button or menu.
- `--live-cadence` 1600ms — the deliberately slow scan of a long-running operation, currently Benchmark's run plan.
- `--blink-cadence` 1060ms — a VT100 cursor's period, for live and pending indicators.
- `--tick-cadence` 640ms + `--tick-steps` 4 — for indeterminate progress.

`--default-transition-duration` and `--default-transition-timing-function` are pointed at the first two inside `@theme`, which is what makes this a system rather than a palette: every bare `transition-*` utility inherits the house curve, including the hundreds of call sites that never named a duration. An explicit `duration-*`/`ease-*` still wins.

Two utility classes replace the stock Tailwind animations on the app's most-seen moving parts:

- `.nexis-spin` — indeterminate progress, stepped through four quarter-turns rather than swept. A terminal spinner is a character cycling in its cell and can only ever be discrete.
- `.nexis-blink` — live/pending indicators, a near-square wave at caret cadence rather than `animate-pulse`'s sine-eased breathe.

`.nexis-thought-head` travels the rail in `ThoughtLine` at `calc(--blink-cadence * 1.6)`, so a reasoning stream in progress pulses on the same clock as the caret rather than introducing a fourth tempo.

`animate-pulse` deliberately survives on `Skeleton` and on indeterminate progress *bars* — a content placeholder is a different idiom from a status caret, and blinking a large filled surface is visually heavy.

`.nexis-scene-enter`, `.nexis-stagger`, `.nexis-result-arrival`, and `.nexis-run-live` are the opt-in data-motion primitives. They are not general decoration: companion windows and result canvases enter once, setup cards stagger once, a finished benchmark cell gets one accent flash, and a running plan gets a slow live scan. The shared reduced-motion rule disables all four. Canvas scenes cannot consume CSS animation, so Atlas's renderer has the same 420ms budget in `CityCanvas.tsx`; it schedules only the short assembly run and draws the complete city in its first frame under reduced motion.

### The `motion` exception

As of 2026-09, `motion` is a runtime dependency. It is for interruptible, spring-driven movement that CSS transitions genuinely cannot express — a rail that must retarget mid-flight, a layout that must animate from wherever it currently is. `use-gliding-rail.ts` (the sidebar and Settings rails), `AppleSpotlight`, and `FolderPreview` are the intended users.

Everything already satisfied by a CSS transition stays on CSS and the tokens above. This is not an invitation to animate in JS by default — note that `atlas/list/DetailPanel.tsx` still carries a comment about having *removed* `motion/react` for exactly that reason, and it was right to.

Every `motion` call site reads `useReducedMotion()` and collapses its spring to `{ duration: 0 }`. The CSS half is covered by the shared reduced-motion rule; the JS half has to opt in per component, which is the cost of this exception.

## The shared interaction primitives

Six components exist so a recurring idea has one implementation and one
behaviour everywhere. **Reach for these before writing a bespoke version** —
that is the whole point, and a second hand-rolled variant is the drift
pitfall #18 describes arriving through a different door.

| Primitive | The idea it owns | Already used by |
|---|---|---|
| `use-gliding-rail.ts` | A selection that *travels* between the items of a nav instead of cutting | sidebar rail, Settings nav, Atlas List/Map, SVG Studio panes |
| `CallChip` | Long-lived work the user started, can time, and can stop | status-bar process chip, ML Lab training, Benchmark sweeps |
| `ThoughtLine` | A stream that is still arriving (live only — never from stored state) | AI reasoning trigger |
| `BranchedMenu` | Grouped menu whose grouping is *drawn*, not inferred from whitespace | unused since the rail lost its overflow menu ([[navigation-surfaces]]) |
| `FolderPreview` / `CursorAura` / `ParticleText` | Scenery, for surfaces that are allowed to be scenery | explorer empty state, welcome screen |

Two rules that keep this from rotting:

- **A new long-running operation gets a `CallChip`**, not a spinner. A spinner
  says "busy", which the app says in four other places; the chip says how long
  and offers the stop. Elapsed formatting comes from `lib/duration.ts` — one
  implementation, shared, so a run shown in two places never reads two
  different durations.
- **A new tab strip, mode switch or section nav gets `useGlidingRail`** — for a small strip inside a panel, use `GlidingTabs` (`components/ui/gliding-tabs.tsx`), which is that hook as a component. It
  measures with `offsetLeft`/`offsetTop`, so the app's ancestor CSS `zoom`
  cancels instead of needing to be divided out (the pitfall #15 family).

## Key files

- `src/components/icon.tsx` — the registry, the size scale, the `Icon` component. The only module allowed to import the icon vendor.
- `src/components/ui/use-gliding-rail.ts` — the shared measure-and-travel hook behind every nav rail
- `src/components/ui/CallChip.tsx`, `ThoughtLine.tsx`, `BranchedMenu.tsx` — the other shared primitives
- `src/lib/duration.ts` — the one `formatElapsed`
- `src/settings/components/providerMarks.ts` — embedded CC0 provider brand marks
- `src/settings/components/ProviderIcon.tsx` — mark-or-glyph selection per `ProviderId`
- `src/modules/explorer/lib/iconResolver.ts` — file/folder art resolution and the theme retint
- `src/modules/explorer/lib/FileTypeIcon.tsx` — inlines that art
- `src/modules/explorer/lib/fileIcons.json` / `folderIcons.ts` — the name/extension → icon association tables
- `src/styles/globals.css` — motion tokens, `@theme` transition defaults, `.nexis-spin`, `.nexis-blink`
- `src/lib/pitfall-guards.test.ts` — the two `pitfall 18` tripwires

## Invariants / gotchas

- **Only `icon.tsx` may import the icon vendor**, and **the file tree must not go back to `data:` URLs**. Both are AGENTS.md pitfall #18 and both are tripwired.
- **The plugin API names icons by string.** `PanelContribution.icon` is an `IconName`, deliberately not a vendor icon object — a plugin must not have to depend on whichever icon package Nexis ships. See [[frontend-modules]].
- **The vscode-icons fallback art is not retinted.** Those entries are brand marks; a recoloured logo is a wrong logo.
- **`FileTypeIcon` renders an empty box, not `null`, while the sets load.** Returning `null` would reflow every row when the JSON resolves.
- Registry entries are not free — each is a static import in the main chunk. Prune a name when its last call site goes.

## Debugging entry points

- A new icon renders nothing → is the name in `REGISTRY`? `IconName` is a closed union, so this usually fails typecheck first
- Icons all one size / stroke looks wrong → a call site passing a raw `size={n}` instead of a scale step
- File-tree icons show Catppuccin's colours under a Nexis theme → the retint map, or the art regressed to a `data:` URL ([[theming]])
- A transition feels wrong app-wide → `--default-transition-*` in the `@theme` block, not the component
- A provider shows a generic glyph → it has no mark in `providerMarks.ts`; that may be deliberate (no logo exists)

## Related

[[theming]] · [[frontend-modules]] · [[window-chrome]] · [[editor]]

## `active` and glyphs whose fill is another drawing

`active` swaps to Phosphor's `fill` weight. For most marks that reads as "selected". For a globe it reads as a different icon (a solid disc). `FILL_CHANGES_SHAPE` in `icon.tsx` lists the glyphs that keep their resting weight when active. Add a name there, rather than dropping `active` at a call site, when a fill turns out to change the shape.

## Rail marks move by clip-path, and motion is `m` only

- **Never animate a rail mark's `width`/`height`.** Use `RailIndicator` (`components/ui/rail-indicator.tsx`) with the rail from `useGlidingRail`. It spans the strip once and animates `clip-path: inset(... round r)`, which is paint-only and keeps corners true. The hook reports `containerExtent` as the items' far edge. It is not `scrollWidth`, because an absolutely positioned indicator counts toward scroll overflow and would pin a strip at its widest. The exception is a mark with a shadow or ring (Atlas's List/Map thumb), which a clip would cut: glide it with `x` only and set the width without animating it.
- **Import `m`, never `motion`, from `motion/react`.** `main.tsx` wraps the app in `LazyMotion features={domAnimation} strict`, so a `motion.*` component throws in development. Layout or drag animations would need `domMax` there.

