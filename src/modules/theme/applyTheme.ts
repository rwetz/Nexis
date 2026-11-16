// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { Theme, ThemeColors, ThemeMode, TerminalPalette } from "./types";

const COLOR_VAR: Record<keyof ThemeColors, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  input: "--input",
  ring: "--ring",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarAccent: "--sidebar-accent",
  sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
  radius: "--radius",
};

const ANSI_VARS: readonly string[] = [
  "--terminal-ansi-black",
  "--terminal-ansi-red",
  "--terminal-ansi-green",
  "--terminal-ansi-yellow",
  "--terminal-ansi-blue",
  "--terminal-ansi-magenta",
  "--terminal-ansi-cyan",
  "--terminal-ansi-white",
  "--terminal-ansi-bright-black",
  "--terminal-ansi-bright-red",
  "--terminal-ansi-bright-green",
  "--terminal-ansi-bright-yellow",
  "--terminal-ansi-bright-blue",
  "--terminal-ansi-bright-magenta",
  "--terminal-ansi-bright-cyan",
  "--terminal-ansi-bright-white",
];

const ALL_VARS: readonly string[] = [
  ...Object.values(COLOR_VAR),
  "--brand",
  "--brand-foreground",
  "--terminal-background",
  "--terminal-foreground",
  "--terminal-cursor",
  "--terminal-cursor-accent",
  "--terminal-selection",
  ...ANSI_VARS,
];

let lastApplied: string | null = null;

/** The dark popover: the card, a small step toward the foreground. */
export const POPOVER_LIFT = "color-mix(in oklab, var(--card) 97%, var(--foreground))";

export function applyTheme(theme: Theme, mode: ThemeMode): void {
  const root = document.documentElement;
  const variant = theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light;
  if (!variant) {
    clearTheme();
    return;
  }
  const colors = variant.colors;
  const terminal = variant.terminal;
  for (const v of ALL_VARS) root.style.removeProperty(v);
  if (colors) {
    writeColors(root, colors);
    // The theme's signature colour goes to --brand, the one accent (the brand
    // button, focus, live progress, the composer aurora, the active-pane
    // glow). `ring` is the vivid accent across themes (Tokyo Night's primary
    // is a washed lavender, its ring the blue); primary is the fallback. The
    // default Nexis theme runs clearTheme(), so --brand falls back to the
    // coral in globals.css.
    const { brand, brandForeground } = brandOf(colors);
    if (brand) root.style.setProperty("--brand", brand);
    if (brandForeground) root.style.setProperty("--brand-foreground", brandForeground);
    // --primary is a neutral, as it is on the default theme (nexis-design
    // RULES R6.2): the themes are shadcn-shaped and ship their accent as
    // `primary`, which would make the default button and every checked
    // control a second accent. So it is the theme's foreground on its
    // background; a theme with neither keeps the stylesheet's neutral.
    if (colors.foreground && colors.background) {
      root.style.setProperty("--primary", colors.foreground);
      root.style.setProperty("--primary-foreground", colors.background);
    }
    // In the dark a floating surface needs its own step above the card
    // (nexis-design R6.6); the themes ship popover equal to card. A theme that
    // gives popover a colour of its own keeps it.
    if (mode === "dark" && (!colors.popover || colors.popover === colors.card)) {
      root.style.setProperty("--popover", POPOVER_LIFT);
    }
  }
  if (terminal) writeTerminal(root, terminal);
  lastApplied = theme.id;
}

/** The accent a theme's colours give, and the text that goes on it. When the
 * accent is the theme's `primary`, its `primaryForeground` was made for it;
 * when it is a different `ring` (Tokyo Night), the background is the safe
 * choice, since an accent has to read against it. `brandForeground` is left
 * out when the stylesheet's white reads better (a mid-tone accent on a light
 * community theme), so white stays. */
export function brandOf(colors: ThemeColors): { brand?: string; brandForeground?: string } {
  const brand = colors.ring ?? colors.primary;
  if (!brand) return {};
  const own =
    brand === colors.primary && colors.primaryForeground ? colors.primaryForeground : colors.background;
  if (!own) return { brand };
  const lb = luminance(brand);
  const lo = luminance(own);
  if (lb === null || lo === null) return { brand, brandForeground: own };
  const ownRatio = (Math.max(lb, lo) + 0.05) / (Math.min(lb, lo) + 0.05);
  const whiteRatio = 1.05 / (lb + 0.05);
  return whiteRatio > ownRatio ? { brand } : { brand, brandForeground: own };
}

/** WCAG relative luminance of a `#rrggbb` colour; null for anything else. */
function luminance(color: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

export function clearTheme(): void {
  if (lastApplied === null) return;
  const root = document.documentElement;
  for (const v of ALL_VARS) root.style.removeProperty(v);
  lastApplied = null;
}

function writeColors(root: HTMLElement, c: ThemeColors): void {
  for (const k of Object.keys(c) as (keyof ThemeColors)[]) {
    // A theme's `primary` is its accent: it reaches --brand, not --primary.
    if (k === "primary" || k === "primaryForeground") continue;
    const v = c[k];
    if (v) root.style.setProperty(COLOR_VAR[k], v);
  }
}

function writeTerminal(root: HTMLElement, t: TerminalPalette): void {
  if (t.background) root.style.setProperty("--terminal-background", t.background);
  if (t.foreground) root.style.setProperty("--terminal-foreground", t.foreground);
  if (t.cursor) root.style.setProperty("--terminal-cursor", t.cursor);
  if (t.cursorAccent) root.style.setProperty("--terminal-cursor-accent", t.cursorAccent);
  if (t.selection) root.style.setProperty("--terminal-selection", t.selection);
  if (t.ansi) {
    for (let i = 0; i < ANSI_VARS.length && i < t.ansi.length; i++) {
      root.style.setProperty(ANSI_VARS[i], t.ansi[i]);
    }
  }
}
