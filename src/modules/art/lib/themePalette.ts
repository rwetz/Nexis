// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Reading the *live* theme as a palette.
 *
 * This is the pack's differentiator, and it is only possible because the theme
 * system already puts everything on the document root as custom properties
 * (`applyTheme.ts`). "Generate art in Aurelian" is a thing no standalone
 * palette tool can do, because no standalone tool knows what Aurelian is.
 *
 * ## Why colours are resolved through a canvas
 *
 * A custom property's computed value is whatever the theme author wrote:
 * `#eab308` in one theme, `oklch(0.72 0.19 85)` in another. `color.ts` parses
 * hex and `rgb()` and deliberately refuses the rest rather than half-parsing
 * it. The browser already contains a complete, correct CSS Color 4 parser, so
 * this asks it: paint one pixel and read the bytes back.
 *
 * `ctx.fillStyle` round-tripping is the tempting shortcut and it is not
 * reliable — Chromium hands back `oklab(…)` or `color(srgb …)` for wide-gamut
 * inputs, so you are back to parsing. A pixel is always four bytes of sRGB.
 */

import { toHex } from "./color";

export type ThemeSwatch = { name: string; hex: string };

/**
 * The UI colours worth seeding from, in the order they are useful to a
 * designer rather than the order they appear in the stylesheet. Deliberately
 * not every token: a palette of forty entries is not a palette.
 */
const UI_TOKENS: readonly [string, string][] = [
  ["--background", "Background"],
  ["--foreground", "Foreground"],
  ["--primary", "Primary"],
  ["--accent", "Accent"],
  ["--muted", "Muted"],
  ["--border", "Border"],
  ["--destructive", "Destructive"],
];

/** The terminal's sixteen, which are the theme's most opinionated colours. */
const ANSI_TOKENS: readonly [string, string][] = [
  ["--terminal-ansi-black", "Black"],
  ["--terminal-ansi-red", "Red"],
  ["--terminal-ansi-green", "Green"],
  ["--terminal-ansi-yellow", "Yellow"],
  ["--terminal-ansi-blue", "Blue"],
  ["--terminal-ansi-magenta", "Magenta"],
  ["--terminal-ansi-cyan", "Cyan"],
  ["--terminal-ansi-white", "White"],
  ["--terminal-ansi-bright-black", "Bright black"],
  ["--terminal-ansi-bright-red", "Bright red"],
  ["--terminal-ansi-bright-green", "Bright green"],
  ["--terminal-ansi-bright-yellow", "Bright yellow"],
  ["--terminal-ansi-bright-blue", "Bright blue"],
  ["--terminal-ansi-bright-magenta", "Bright magenta"],
  ["--terminal-ansi-bright-cyan", "Bright cyan"],
  ["--terminal-ansi-bright-white", "Bright white"],
];

export type ThemeSource = "ui" | "ansi";

/**
 * Resolve any CSS colour string to `#rrggbb`, or null if the browser does not
 * recognise it.
 *
 * The canvas is seeded with a colour, painted over with the candidate, and
 * read back — so a value the browser rejects leaves the seed behind and is
 * detected, rather than silently reporting transparent black as a real colour.
 */
export function resolveCssColor(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  // A sentinel the candidate must overwrite. If the browser rejects the
  // candidate, `fillStyle` keeps its previous value and the sentinel survives,
  // which is the signal that the parse failed.
  const SENTINEL = "#010203";
  ctx.fillStyle = SENTINEL;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = input;
  if (ctx.fillStyle === SENTINEL && input.toLowerCase() !== SENTINEL) {
    return null;
  }
  // A translucent candidate would blend with the sentinel, so clear first.
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);

  try {
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    // Fully transparent means nothing was painted — treat it as unresolved
    // rather than reporting black.
    if (a === 0) return null;
    return toHex({ r, g, b });
  } catch {
    // getImageData throws on a tainted canvas; nothing here taints it, but a
    // hardened environment can still refuse.
    return null;
  }
}

/** Read one custom property off the document root and resolve it. */
export function resolveThemeToken(token: string): string | null {
  if (typeof document === "undefined") return null;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return raw ? resolveCssColor(raw) : null;
}

/**
 * The active theme as swatches. Tokens that do not resolve are dropped rather
 * than emitted as black — a theme need not define every token, and a palette
 * silently full of black would be worse than a shorter one.
 */
export function themePalette(source: ThemeSource): ThemeSwatch[] {
  const tokens = source === "ansi" ? ANSI_TOKENS : UI_TOKENS;
  const out: ThemeSwatch[] = [];
  for (const [token, name] of tokens) {
    const hex = resolveThemeToken(token);
    if (hex) out.push({ name, hex });
  }
  return out;
}
