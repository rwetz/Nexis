---
type: subsystem
description: How a theme becomes CSS variables, builtin/community/custom sets, the generated Nexis ramp, and every surface that reads a theme colour.
---

# Theming

A theme is a data object (`Theme` in `src/modules/theme/types.ts`), not a stylesheet. `ThemeProvider` resolves the active id plus the resolved light/dark mode, and `applyTheme()` writes the variant's colours onto `document.documentElement` as CSS custom properties (`--background`, `--sidebar-*`, `--terminal-ansi-*`, …). Everything downstream: Tailwind tokens, xterm.js, the surface/glow layer: reads those variables rather than the theme object. Selecting the default theme calls `clearTheme()` instead, which removes the properties and lets `src/styles/globals.css` supply the base look.

## The three sets

- **Nexis themes** (`themes/*.ts`): seventeen (the six quiet originals plus Vermillion and the ten loud ones added in 1.26.0), all with light *and* dark variants. They are **generated**, not hand-written: `scripts/generate-theme-palettes.py` cuts every one from a single shared OKLCH lightness ramp so the set holds one contrast profile across every hue family. Edit the script's `THEMES` table and re-run it; do not hand-edit the emitted `.ts`.
- **Community themes** (`themes/community/*.ts`): authored elsewhere, credited via `author`, and deliberately *not* conformed to the Nexis ramp. Held only to WCAG AA.
- **Custom themes**: user `.nexis-theme` JSON, validated by `validateTheme.ts`, stored via `customThemes.ts`/`themeFiles.ts`, created and edited in a separate window (`emitThemeEdit`).

Custom theme files live under the host app-config directory. `themeFiles.ts` must use `hostFilesystem`, never the active workspace environment; otherwise a WSL workspace incorrectly routes a Windows app-data path into the distro.

Settings → Themes accepts the versioned Lumen palette and scene JSON described in `docs/interop/lumen.md`. `lumenExchange.ts` converts their palette to a new custom theme and exports the active theme's resolved colors to Lumen. `lumenWorkspace.ts` validates the separate workspace handoff; the UI asks for a local host folder before writing its scene there. These paths do not consume live Lumen runtime state or silently authorize a Nexis workspace.

## Animated backgrounds

`SurfaceLayer` picks one of five by `backgroundAnimatedId` and hands it the active theme's `primary`, re-keying on theme/mode change so colours refresh. All five live in `src/components/ui/backgrounds/` and all five gate their rAF through `rafLoop.ts` (hidden documents must not keep rendering: WebKitGTK does not reliably throttle them).

Four are `ogl` fragment shaders on a full-screen triangle (Aurora, Particles, Threads, DarkVeil); **Dot Grid is canvas 2D**, deliberately, so there is one background that still works with no usable WebGL context. **Dither** is a port *onto* `ogl` from the reference three.js + `@react-three/fiber` + `@react-three/postprocessing` stack: its two passes collapse into one fragment shader because the "post" pass has no scene to read back, only the luminance the first pass just computed.

### Two background sets, deliberately separate

`AnimatedBgId` (Aurora / Particles / Threads) is the **app-wide** background: it sits behind every pane at low opacity via `SurfaceLayer`, and its job is to stay out of the way of work.

`WelcomeBgId` is the **welcome screen's own** set, owned by `WelcomeScreen`. That surface is the one place in Nexis allowed to be scenery, so its backgrounds are full-strength and `position: absolute` (they fill a pane, they are not a window overlay); a radial mask (`.welcome-bg`) holds the centre back so the mark and wordmark read over any of them. `WELCOME_BG_ORDER` + `nextWelcomeBg` rotate it **once per viewing** when `welcomeBackgroundCycle` is on: the rotation writes the *next* id back to preferences, so the screen holds what it started with and the next viewing picks up the write.

Two are built in: **Ward** (`AsciiWard.tsx`, the default), the brand kit's `ascii` motion from occult-dioramas (`brandkit/motion.js`) ported to read the theme's `--brand`/`--foreground`/`--muted-foreground` and re-read them on `paletteEpoch`, and **Dark Veil**. Everything else is a **library background**, stored in the pref as `lib:<id>`:

- The library is the public repo `rwetz/nexis-backgrounds`, read from `raw.githubusercontent.com/.../main/index.json` (the same shape as Press's `press-shaders`). Each entry is a versioned folder with `loop.mp4` (1600x1000 H.264, ~10 MB, a seamless loop rendered by occult-dioramas' `npm run loops`) and `poster.jpg`.
- `src/modules/welcome/backgroundLibrary.ts` fetches the index, downloads a loop, checks byte count, the MP4 `ftyp` box and the index's SHA-256, and stores it as a Blob in IndexedDB (`nexis-welcome-backgrounds`), which every window shares. Installs and removals emit `nexis://welcome-backgrounds-changed` so the Settings picker in another window re-reads.
- **Backgrounds are data only.** A library entry is a video played by a muted `<video>` from a `blob:` URL; nothing downloaded is executed. Keep it that way: the main webview holds PTY, fs and AI-tool IPC, so a "live" scene shipped as JavaScript would be code from a repo running with all of that. CSP allows `raw.githubusercontent.com` in `connect-src`/`img-src` and `blob:` in `media-src` for this and nothing else.
- `LibraryVideoBackground` falls back to Ward when the background has been removed or the webview cannot decode H.264 (WebKitGTK without the GStreamer libav plugin).
- Rotation includes installed library backgrounds after the built-ins; `nextWelcomeBg(current, installed)` restarts at the first when the current one was uninstalled.
- To publish a new one: render the loop in occult-dioramas, then in nexis-backgrounds run `scripts/encode.sh` and `node scripts/build-index.mjs`, which fills `bytes` and `sha256` (see that repo's AGENTS.md). Pushing `main` publishes to every Nexis.

Dither alone is not theme-tinted: it ships the grey-on-black BG Studio settings verbatim, and its swatch in Settings is drawn un-tinted to match rather than promising a colour it will not use.

## Key files

- `src/modules/theme/SurfaceLayer.tsx`: background dispatch, theme-colour derivation, the image fast path
- `src/components/ui/backgrounds/`: the canvas and shader backgrounds (including `AsciiWard`) plus the shared `rafLoop` visibility gate
- `src/modules/welcome/`: the welcome-background library client and the video background; `src/settings/components/BackgroundLibraryDialog.tsx` is **Browse more backgrounds**
- `src/modules/theme/types.ts`: `Theme`, `ThemeColors`, `TerminalPalette`, `DEFAULT_THEME_ID`
- `src/modules/theme/themes/index.ts`: the three lists, `getBuiltinTheme`, and `migrateThemeId` (retired ids → survivors)
- `src/modules/theme/applyTheme.ts`: the only writer of theme CSS variables; derives `--brand` from `ring ?? primary` and `--brand-foreground` from the theme (`brandOf`). A theme's `primary` is its *accent*, so it never reaches `--primary`: that is set to the theme's foreground on its background, keeping `--primary` neutral on every theme (nexis-design R6.2). In dark mode a popover that equals the card is lifted a step (`POPOVER_LIFT`, R6.6). Code that wants "the theme's colour" uses `bg-brand`/`text-brand` (only for the primary action, focus or live progress), or reads `variant.colors.primary` from theme data as `SurfaceLayer` and the theme swatches do
- `src/modules/theme/ThemeProvider.tsx`: id/mode resolution, localStorage fast path, the `editorTheme` nudge, and the `html[data-theme]` stamp
- `src/modules/theme/rainbowAccent.ts`, the default theme's rainbow hover: scope, the four variants, and the per-hover cycle
- `src/modules/theme/RainbowDefs.tsx`: the same four gradients as SVG paint servers, for icon glyphs
- `src/styles/terminalTheme.ts`: reads the `--terminal-*` variables back out into an xterm.js `ITheme`
- `src/modules/theme/folderColor.ts`: per-theme explorer folder tint
- `src/modules/explorer/lib/iconResolver.ts`: retints the catppuccin file-tree art onto `--terminal-ansi-*`; `lib/FileTypeIcon.tsx` inlines it
- `src/settings/sections/ThemesSection.tsx`: the grouped picker (`ThemeGroup`)
- `scripts/generate-theme-palettes.py`: the ramp, the contrast floors, the `.ts` renderer, and the base palette pasted into `globals.css`

## Invariants / gotchas

- **The default theme's terminal palette is in `globals.css`, not in `nexis-default.ts`.** `ThemeProvider` calls `clearTheme()` for the default theme, so anything in that file is never applied: it is deliberately empty and must stay that way. The palette is still *generated*: `generate-theme-palettes.py` has a base-palette pass on the same ramp and floors, checked against the backgrounds the stylesheet declares, and it prints two blocks to paste. Do not hand-tune a hex there, and do not "fix" the empty variants by filling them in.
- **Those same defaults are the fallback for every theme that omits a terminal colour.** All five community themes define their own, so the coral cursor only ever surfaces on the default theme and on custom user themes that leave `terminal` out.
- **Contrast floors are enforced twice.** The generator refuses to emit a failing palette; `themes/themes.contrast.test.ts` re-asserts the same floors against the committed files so a hand-edit can't bypass it. Fix the colour, not the floor.
- **`folderColor.ts` must stay in sync with each Nexis theme's `primary`**: tripwired in the same test. Nothing else couples them, and it is easy to change an accent and forget the folder tint.
- **The file-tree icons are retinted, and that only works inlined.** `iconResolver` maps catppuccin's 19 baked-in hexes onto the theme's own ANSI palette and emits `var(--terminal-ansi-*)`. Those resolve only because `<FileTypeIcon>` inlines the SVG into the document, a `data:` URL is an isolated document that the page's custom properties do not cascade into, so reverting to `<img src="data:…">` silently un-themes the whole tree. Tripwired as `pitfall 18`. The vscode-icons fallback art is deliberately *not* retinted: those are brand marks.
- **A rule only one theme should have goes through an attribute on `<html>`, not through a variable.** Palettes are delivered as custom properties, which covers colour and nothing else. `ThemeProvider` sets `data-rainbow-accent` when the default theme is active *and* the preference is on, and every rainbow rule in `globals.css` gates on that one flag, not a theme test in one rule and a preference test in another. Mirrors the `html[data-os]` pattern in the same file. If a second theme-scoped rule ever appears, add the attribute it needs rather than overloading this one.
- **The rainbow hover accent decides in TS and paints in CSS, and the split is not optional.** `rainbowAccent.ts` owns which controls qualify and which of the four gradients each gets; `globals.css` has one rule per mode that reads the `--rainbow-*` properties the listener stamps. An SVG gets the gradient on its glyph, including in a labelled control; a text-only control gets it on its text. Neither mode replaces the neutral hover background. The reason the choice cannot live in CSS is that it *rotates*: a button shows a different gradient on every hover, and CSS cannot advance a counter on a pointer event. The first version was CSS-only, matched every hover utility in the tree, and fired on ~200 call sites; narrowing scope from a stylesheet means guessing at selectors, so scope lives in the module as two readable predicates.
- **The four gradients exist twice, and only their direction and hue are duplicated.** A CSS `linear-gradient()` cannot paint an SVG path, so icon glyphs are filled from `<linearGradient>` paint servers in `RainbowDefs.tsx`. Both halves read the same `--accent-rainbow-*` tokens for lightness and chroma, and `RainbowDefs` derives its `x1/y1/x2/y2` from the same `RAINBOW_VARIANTS` array the listener cycles, so a palette or variant change moves both. Those tokens resolve inside the defs only because they are inlined into the document; a `data:` URL or standalone `.svg` would silently break every stop, exactly as it would for the file-tree retint (pitfall #18).
- **The rainbow keeps one readable lightness across all seven stops.** The hue rotates while `--accent-rainbow-glyph-l` stays fixed, so neither an icon nor text develops a bright band that becomes illegible against the ordinary neutral hover surface. Re-check contrast against both default-theme modes before changing it.
- **A theme's `editorTheme` only nudges a global preference.** It is written through `setEditorTheme`, so it overwrites whatever the user picked in Settings → Editor, and only if the id is in `EDITOR_THEMES`. It is not scoped to the theme.
- **Removing a builtin id strands anyone using it.** Add it to `RETIRED` in `themes/index.ts`: the migration has to cover the localStorage fast path, the initial `loadPreferences`, and the cross-window `prefs-changed` listener, or one of the three will resurrect the dead id.
- Theme switching runs inside a View Transition **except on Linux**, where WebKitGTK's snapshot path kills the web process on the NVIDIA driver: see the comment on `withViewTransition`.
- Cross-window propagation is the ordinary preferences path: see [[settings-sync]] and AGENTS.md pitfall #2.

- **High contrast overrides tokens on `<body>`, never on `:root`.** `applyTheme` writes each palette as inline custom properties on `<html>`, and an inline declaration beats any stylesheet rule on the same element. Custom properties inherit, so the `html[data-contrast="high"] body { … }` block in `globals.css` wins for the whole app. It only reaches Tailwind utilities because `@theme inline` makes them read `var(--border)` at the element. A test in `components/ui/gliding-tabs.test.tsx` fails if the tokens move up. The attribute comes from `ThemeProvider` (`contrast` preference, or the OS under "system"), which also turns off the rainbow and exposes `highContrast`. `SurfaceLayer` renders nothing under it, and `rendererPool` sets `minimumContrastRatio: 7` from the same attribute.

## Debugging entry points

- Colours don't change on switch → is `applyTheme` writing, or did the id fall through `resolveTheme` to the default? (an unknown id silently resolves to default)
- Terminal colours stale after a switch → `buildTerminalTheme()` reads *computed* styles; it must run after `applyTheme`
- A theme looks right but its folder icon doesn't → `folderColor.ts`, not the theme file
- File-tree icons keep Catppuccin's colours under a Nexis theme → the retint map in `iconResolver.ts`, or the art regressed to a `data:` URL
- Blank screen after touching the picker → a selector returning a fresh array (AGENTS.md pitfall #14)
- Rainbow shows up under a non-default theme, or not at all under the default → the `data-rainbow-accent` flag in `ThemeProvider`, which needs both the theme and the preference
- Terminal colours look generic, or ANSI white is invisible in light mode → the palette in `globals.css`, not a theme file; check `.dark` has its own block
- A control that should get a rainbow doesn't → `isRainbowTarget` in `rainbowAccent.ts`: it needs to be a button/tab/link **and** carry a neutral-highlight hover utility. A primary or destructive variant is excluded on purpose
- An icon button lights its background instead of its glyph (or vice versa) → `visibleLabel`; a non-`sr-only` text node inside the button makes it read as labelled

## Related

[[settings-sync]] · [[editor]] · [[frontend-modules]] · [[window-chrome]] · [[icon-and-motion-system]]
