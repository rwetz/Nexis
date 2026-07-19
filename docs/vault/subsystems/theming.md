---
type: subsystem
description: How a theme becomes CSS variables — builtin/community/custom sets, the generated Nexis ramp, and every surface that reads a theme colour.
---

# Theming

A theme is a data object (`Theme` in `src/modules/theme/types.ts`), not a stylesheet. `ThemeProvider` resolves the active id plus the resolved light/dark mode, and `applyTheme()` writes the variant's colours onto `document.documentElement` as CSS custom properties (`--background`, `--sidebar-*`, `--terminal-ansi-*`, …). Everything downstream — Tailwind tokens, xterm.js, the surface/glow layer — reads those variables rather than the theme object. Selecting the default theme calls `clearTheme()` instead, which removes the properties and lets `src/styles/globals.css` supply the base look.

## The three sets

- **Nexis themes** (`themes/*.ts`) — six originals, all with light *and* dark variants. They are **generated**, not hand-written: `scripts/generate-theme-palettes.py` cuts every one from a single shared OKLCH lightness ramp so the set holds one contrast profile across six hue families. Edit the script's `THEMES` table and re-run it; do not hand-edit the emitted `.ts`.
- **Community themes** (`themes/community/*.ts`) — authored elsewhere, credited via `author`, and deliberately *not* conformed to the Nexis ramp. Held only to WCAG AA.
- **Custom themes** — user `.nexis-theme` JSON, validated by `validateTheme.ts`, stored via `customThemes.ts`/`themeFiles.ts`, created and edited in a separate window (`emitThemeEdit`).

## Key files

- `src/modules/theme/types.ts` — `Theme`, `ThemeColors`, `TerminalPalette`, `DEFAULT_THEME_ID`
- `src/modules/theme/themes/index.ts` — the three lists, `getBuiltinTheme`, and `migrateThemeId` (retired ids → survivors)
- `src/modules/theme/applyTheme.ts` — the only writer of theme CSS variables; also derives `--brand` from `ring ?? primary`
- `src/modules/theme/ThemeProvider.tsx` — id/mode resolution, localStorage fast path, the `editorTheme` nudge
- `src/styles/terminalTheme.ts` — reads the `--terminal-*` variables back out into an xterm.js `ITheme`
- `src/modules/theme/folderColor.ts` — per-theme explorer folder tint
- `src/settings/sections/ThemesSection.tsx` — the grouped picker (`ThemeGroup`)
- `scripts/generate-theme-palettes.py` — the ramp, the contrast floors, and the `.ts` renderer

## Invariants / gotchas

- **Contrast floors are enforced twice.** The generator refuses to emit a failing palette; `themes/themes.contrast.test.ts` re-asserts the same floors against the committed files so a hand-edit can't bypass it. Fix the colour, not the floor.
- **`folderColor.ts` must stay in sync with each Nexis theme's `primary`** — tripwired in the same test. Nothing else couples them, and it is easy to change an accent and forget the folder tint.
- **A theme's `editorTheme` only nudges a global preference.** It is written through `setEditorTheme`, so it overwrites whatever the user picked in Settings → Editor, and only if the id is in `EDITOR_THEMES`. It is not scoped to the theme.
- **Removing a builtin id strands anyone using it.** Add it to `RETIRED` in `themes/index.ts` — the migration has to cover the localStorage fast path, the initial `loadPreferences`, and the cross-window `prefs-changed` listener, or one of the three will resurrect the dead id.
- Theme switching runs inside a View Transition **except on Linux**, where WebKitGTK's snapshot path kills the web process on the NVIDIA driver — see the comment on `withViewTransition`.
- Cross-window propagation is the ordinary preferences path — see [[settings-sync]] and CLAUDE.md pitfall #2.

## Debugging entry points

- Colours don't change on switch → is `applyTheme` writing, or did the id fall through `resolveTheme` to the default? (an unknown id silently resolves to default)
- Terminal colours stale after a switch → `buildTerminalTheme()` reads *computed* styles; it must run after `applyTheme`
- A theme looks right but its folder icon doesn't → `folderColor.ts`, not the theme file
- Blank screen after touching the picker → a selector returning a fresh array (CLAUDE.md pitfall #14)

## Related

[[settings-sync]] · [[editor]] · [[frontend-modules]] · [[window-chrome]]
