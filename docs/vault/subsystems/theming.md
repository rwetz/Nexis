---
type: subsystem
description: How a theme becomes CSS variables — builtin/community/custom sets, the generated Nexis ramp, and every surface that reads a theme colour.
---

# Theming

A theme is a data object (`Theme` in `src/modules/theme/types.ts`), not a stylesheet. `ThemeProvider` resolves the active id plus the resolved light/dark mode, and `applyTheme()` writes the variant's colours onto `document.documentElement` as CSS custom properties (`--background`, `--sidebar-*`, `--terminal-ansi-*`, …). Everything downstream — Tailwind tokens, xterm.js, the surface/glow layer — reads those variables rather than the theme object. Selecting the default theme calls `clearTheme()` instead, which removes the properties and lets `src/styles/globals.css` supply the base look.

## The three sets

- **Nexis themes** (`themes/*.ts`) — seventeen (the six quiet originals plus Vermillion and the ten loud ones added in 1.26.0), all with light *and* dark variants. They are **generated**, not hand-written: `scripts/generate-theme-palettes.py` cuts every one from a single shared OKLCH lightness ramp so the set holds one contrast profile across every hue family. Edit the script's `THEMES` table and re-run it; do not hand-edit the emitted `.ts`.
- **Community themes** (`themes/community/*.ts`) — authored elsewhere, credited via `author`, and deliberately *not* conformed to the Nexis ramp. Held only to WCAG AA.
- **Custom themes** — user `.nexis-theme` JSON, validated by `validateTheme.ts`, stored via `customThemes.ts`/`themeFiles.ts`, created and edited in a separate window (`emitThemeEdit`).

## Key files

- `src/modules/theme/types.ts` — `Theme`, `ThemeColors`, `TerminalPalette`, `DEFAULT_THEME_ID`
- `src/modules/theme/themes/index.ts` — the three lists, `getBuiltinTheme`, and `migrateThemeId` (retired ids → survivors)
- `src/modules/theme/applyTheme.ts` — the only writer of theme CSS variables; also derives `--brand` from `ring ?? primary`
- `src/modules/theme/ThemeProvider.tsx` — id/mode resolution, localStorage fast path, the `editorTheme` nudge, and the `html[data-theme]` stamp
- `src/modules/theme/rainbowAccent.ts` — the default theme's rainbow hover: scope, the four variants, and the per-hover cycle
- `src/modules/theme/RainbowDefs.tsx` — the same four gradients as SVG paint servers, for icon glyphs
- `src/styles/terminalTheme.ts` — reads the `--terminal-*` variables back out into an xterm.js `ITheme`
- `src/modules/theme/folderColor.ts` — per-theme explorer folder tint
- `src/modules/explorer/lib/iconResolver.ts` — retints the catppuccin file-tree art onto `--terminal-ansi-*`; `lib/FileTypeIcon.tsx` inlines it
- `src/settings/sections/ThemesSection.tsx` — the grouped picker (`ThemeGroup`)
- `scripts/generate-theme-palettes.py` — the ramp, the contrast floors, the `.ts` renderer, and the base palette pasted into `globals.css`

## Invariants / gotchas

- **The default theme's terminal palette is in `globals.css`, not in `nexis-default.ts`.** `ThemeProvider` calls `clearTheme()` for the default theme, so anything in that file is never applied — it is deliberately empty and must stay that way. The palette is still *generated*: `generate-theme-palettes.py` has a base-palette pass on the same ramp and floors, checked against the backgrounds the stylesheet declares, and it prints two blocks to paste. Do not hand-tune a hex there, and do not "fix" the empty variants by filling them in.
- **Those same defaults are the fallback for every theme that omits a terminal colour.** All five community themes define their own, so the coral cursor only ever surfaces on the default theme and on custom user themes that leave `terminal` out.
- **Contrast floors are enforced twice.** The generator refuses to emit a failing palette; `themes/themes.contrast.test.ts` re-asserts the same floors against the committed files so a hand-edit can't bypass it. Fix the colour, not the floor.
- **`folderColor.ts` must stay in sync with each Nexis theme's `primary`** — tripwired in the same test. Nothing else couples them, and it is easy to change an accent and forget the folder tint.
- **The file-tree icons are retinted, and that only works inlined.** `iconResolver` maps catppuccin's 19 baked-in hexes onto the theme's own ANSI palette and emits `var(--terminal-ansi-*)`. Those resolve only because `<FileTypeIcon>` inlines the SVG into the document — a `data:` URL is an isolated document that the page's custom properties do not cascade into, so reverting to `<img src="data:…">` silently un-themes the whole tree. Tripwired as `pitfall 18`. The vscode-icons fallback art is deliberately *not* retinted: those are brand marks.
- **A rule only one theme should have goes through an attribute on `<html>`, not through a variable.** Palettes are delivered as custom properties, which covers colour and nothing else. `ThemeProvider` sets `data-rainbow-accent` when the default theme is active *and* the preference is on, and every rainbow rule in `globals.css` gates on that one flag — not a theme test in one rule and a preference test in another. Mirrors the `html[data-os]` pattern in the same file. If a second theme-scoped rule ever appears, add the attribute it needs rather than overloading this one.
- **The rainbow hover accent decides in TS and paints in CSS, and the split is not optional.** `rainbowAccent.ts` owns which controls qualify and which of the four gradients each gets; `globals.css` has one rule per mode that reads the `--rainbow-*` properties the listener stamps. The reason the choice cannot live in CSS is that it *rotates* — a button shows a different gradient on every hover, and CSS cannot advance a counter on a pointer event. The first version was CSS-only, matched every hover utility in the tree, and fired on ~200 call sites; narrowing scope from a stylesheet means guessing at selectors, so scope lives in the module as two readable predicates.
- **The four gradients exist twice, and only their direction and hue are duplicated.** A CSS `linear-gradient()` cannot paint an SVG path, so icon glyphs are filled from `<linearGradient>` paint servers in `RainbowDefs.tsx`. Both halves read the same `--accent-rainbow-*` tokens for lightness and chroma, and `RainbowDefs` derives its `x1/y1/x2/y2` from the same `RAINBOW_VARIANTS` array the listener cycles — so a palette or variant change moves both. Those tokens resolve inside the defs only because they are inlined into the document; a `data:` URL or standalone `.svg` would silently break every stop, exactly as it would for the file-tree retint (pitfall #18).
- **A lit surface carries its own ink colour, and that is a contrast fix, not a style choice.** The gradient is opaque, so white-on-hover text over it lands near 3:1; `--accent-rainbow-ink` puts it back above 5:1. The other half is holding one lightness across all seven stops — the hue rotates, the value does not, so there is no bright band for a label to disappear into. Raising `--accent-rainbow-l` without re-checking both is how this regresses.
- **A theme's `editorTheme` only nudges a global preference.** It is written through `setEditorTheme`, so it overwrites whatever the user picked in Settings → Editor, and only if the id is in `EDITOR_THEMES`. It is not scoped to the theme.
- **Removing a builtin id strands anyone using it.** Add it to `RETIRED` in `themes/index.ts` — the migration has to cover the localStorage fast path, the initial `loadPreferences`, and the cross-window `prefs-changed` listener, or one of the three will resurrect the dead id.
- Theme switching runs inside a View Transition **except on Linux**, where WebKitGTK's snapshot path kills the web process on the NVIDIA driver — see the comment on `withViewTransition`.
- Cross-window propagation is the ordinary preferences path — see [[settings-sync]] and CLAUDE.md pitfall #2.

## Debugging entry points

- Colours don't change on switch → is `applyTheme` writing, or did the id fall through `resolveTheme` to the default? (an unknown id silently resolves to default)
- Terminal colours stale after a switch → `buildTerminalTheme()` reads *computed* styles; it must run after `applyTheme`
- A theme looks right but its folder icon doesn't → `folderColor.ts`, not the theme file
- File-tree icons keep Catppuccin's colours under a Nexis theme → the retint map in `iconResolver.ts`, or the art regressed to a `data:` URL
- Blank screen after touching the picker → a selector returning a fresh array (CLAUDE.md pitfall #14)
- Rainbow shows up under a non-default theme, or not at all under the default → the `data-rainbow-accent` flag in `ThemeProvider`, which needs both the theme and the preference
- Terminal colours look generic, or ANSI white is invisible in light mode → the palette in `globals.css`, not a theme file; check `.dark` has its own block
- A control that should get a rainbow doesn't → `isRainbowTarget` in `rainbowAccent.ts`: it needs to be a button/tab/link **and** carry a neutral-highlight hover utility. A primary or destructive variant is excluded on purpose
- An icon button lights its background instead of its glyph (or vice versa) → `visibleLabel`; a non-`sr-only` text node inside the button makes it read as labelled

## Related

[[settings-sync]] · [[editor]] · [[frontend-modules]] · [[window-chrome]] · [[icon-and-motion-system]]
