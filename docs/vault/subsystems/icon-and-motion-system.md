---
type: subsystem
description: The semantic icon choke point, the house size scale, and the terminal-derived motion tokens — what every glyph and transition in the UI goes through.
---

# Icon & motion system

Two surfaces that used to be per-call-site decisions and are now systems. **Icons** resolve through one module that maps app vocabulary onto a vendor's glyphs, so the vendor is swappable and one idea renders as one glyph. **Motion** resolves through CSS tokens wired into Tailwind's transition defaults, so timing is a property of the app rather than of whichever utility a component happened to type.

Both exist for the same reason, recorded as CLAUDE.md pitfall #18: a UI assembled from library defaults is indistinguishable from every other UI assembled from the same defaults. The design brief was to stop inheriting and start deciding.

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
- `--dur-tap` 90ms / `--dur-panel` 140ms / `--dur-window` 200ms — scaled by how far the element actually travels.
- `--blink-cadence` 1060ms — a VT100 cursor's period, for live and pending indicators.
- `--tick-cadence` 640ms + `--tick-steps` 4 — for indeterminate progress.

`--default-transition-duration` and `--default-transition-timing-function` are pointed at the first two inside `@theme`, which is what makes this a system rather than a palette: every bare `transition-*` utility inherits the house curve, including the hundreds of call sites that never named a duration. An explicit `duration-*`/`ease-*` still wins.

Two utility classes replace the stock Tailwind animations on the app's most-seen moving parts:

- `.nexis-spin` — indeterminate progress, stepped through four quarter-turns rather than swept. A terminal spinner is a character cycling in its cell and can only ever be discrete.
- `.nexis-blink` — live/pending indicators, a near-square wave at caret cadence rather than `animate-pulse`'s sine-eased breathe.

`animate-pulse` deliberately survives on `Skeleton` and on indeterminate progress *bars* — a content placeholder is a different idiom from a status caret, and blinking a large filled surface is visually heavy.

## Key files

- `src/components/icon.tsx` — the registry, the size scale, the `Icon` component. The only module allowed to import the icon vendor.
- `src/settings/components/providerMarks.ts` — embedded CC0 provider brand marks
- `src/settings/components/ProviderIcon.tsx` — mark-or-glyph selection per `ProviderId`
- `src/modules/explorer/lib/iconResolver.ts` — file/folder art resolution and the theme retint
- `src/modules/explorer/lib/FileTypeIcon.tsx` — inlines that art
- `src/modules/explorer/lib/fileIcons.json` / `folderIcons.ts` — the name/extension → icon association tables
- `src/styles/globals.css` — motion tokens, `@theme` transition defaults, `.nexis-spin`, `.nexis-blink`
- `src/lib/pitfall-guards.test.ts` — the two `pitfall 18` tripwires

## Invariants / gotchas

- **Only `icon.tsx` may import the icon vendor**, and **the file tree must not go back to `data:` URLs**. Both are CLAUDE.md pitfall #18 and both are tripwired.
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
