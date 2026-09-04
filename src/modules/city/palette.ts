// The city colours, derived from the active theme at runtime.
//
// Canvas cannot read CSS variables, so every colour here goes through the
// probe in styles/tokens.ts (the pattern DESIGN_SYSTEM.md prescribes for
// non-CSS consumers) and comes back as concrete channels we can shade
// per face. Re-read on every theme change — the renderer does exactly that.
//
// Language colours are a data-viz ramp, not brand: a fixed low-chroma OKLCH
// ring with the 15deg–55deg wedge left empty so nothing in the city can be
// mistaken for the coral `--brand`, which is reserved for working-tree state
// and selection.

import { resolveCssColor } from "@/styles/tokens";

export type Rgb = { r: number; g: number; b: number };

export type Palette = {
  isDark: boolean;
  background: Rgb;
  foreground: Rgb;
  muted: Rgb;
  mutedForeground: Rgb;
  border: Rgb;
  card: Rgb;
  brand: Rgb;
  destructive: Rgb;
  /** The plate everything sits on. */
  ground: Rgb;
  /** Directory slab, tinted by nesting depth. */
  terrace: (depth: number) => Rgb;
  lang: (name: string) => Rgb;
};

const BLACK: Rgb = { r: 0, g: 0, b: 0 };

type Rgba = Rgb & { a: number };

function parseRgba(value: string): Rgba {
  const m = value.match(/-?\d+(\.\d+)?/g);
  if (!m || m.length < 3) return { ...BLACK, a: 1 };
  return {
    r: Number(m[0]),
    g: Number(m[1]),
    b: Number(m[2]),
    a: m.length > 3 ? Number(m[3]) : 1,
  };
}

/** Translucent tokens (dark-mode hairlines are white at 10%) are flattened
 *  against the surface they will be painted over, since the canvas has no
 *  layer underneath to blend with. */
function flatten(value: string, over: Rgb): Rgb {
  const c = parseRgba(value);
  return c.a >= 1 ? { r: c.r, g: c.g, b: c.b } : mix(over, c, c.a);
}

export function css(c: Rgb, alpha = 1): string {
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Multiply channels — how the three box faces get their light. */
export function shade(c: Rgb, factor: number): Rgb {
  return {
    r: Math.max(0, Math.min(255, c.r * factor)),
    g: Math.max(0, Math.min(255, c.g * factor)),
    b: Math.max(0, Math.min(255, c.b * factor)),
  };
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

// Face lighting: sun from the upper left, so the top face is brightest, the
// left wall catches a little, the right wall falls into shadow.
export const FACE_TOP = 1;
export const FACE_LEFT = 0.8;
export const FACE_RIGHT = 0.58;

/** Hue in degrees, chroma multiplier. Chroma stays low so the city reads as
 *  a neutral grey model that has been *tinted*, not a bag of highlighters. */
const LANG_HUE: Record<string, [number, number]> = {
  TypeScript: [252, 1],
  JavaScript: [95, 1],
  Rust: [72, 1],
  Python: [228, 1],
  Go: [198, 1],
  C: [302, 0.85],
  "C++": [312, 0.85],
  "C#": [322, 0.85],
  Java: [350, 0.9],
  Kotlin: [286, 0.9],
  Swift: [338, 0.9],
  Ruby: [356, 0.9],
  PHP: [274, 0.85],
  Lua: [262, 0.85],
  Zig: [78, 0.9],
  Elixir: [296, 0.85],
  Haskell: [268, 0.85],
  Scala: [332, 0.85],
  Dart: [192, 0.9],
  SQL: [166, 0.8],
  Shell: [146, 0.9],
  PowerShell: [240, 0.85],
  CSS: [212, 0.8],
  HTML: [102, 0.8],
  Web: [132, 0.85],
  Nix: [220, 0.75],
  Terraform: [290, 0.75],
  Protobuf: [172, 0.7],
  GraphQL: [344, 0.8],
  Notebook: [86, 0.8],
  Make: [156, 0.7],
  CMake: [162, 0.7],
  Docker: [234, 0.75],
  // Support files: present, but visibly quieter than code.
  JSON: [112, 0.4],
  Config: [124, 0.4],
  Docs: [182, 0.4],
  Lockfile: [0, 0.06],
  Image: [0, 0.06],
  Font: [0, 0.06],
  Binary: [0, 0.06],
  Other: [0, 0.06],
};

/** Unknown languages get a stable hue from their name, kept out of the
 *  coral wedge so they never impersonate the brand accent. */
function hashedHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  // 300 usable degrees, offset past the reserved 15deg–55deg wedge.
  return 56 + (h % 300);
}

export function readPalette(isDark: boolean): Palette {
  const raw = (name: string) => resolveCssColor(`var(--${name})`);
  // Background first: everything translucent is flattened against it.
  const background = flatten(raw("background"), BLACK);
  const token = (name: string) => flatten(raw(name), background);

  const foreground = token("foreground");
  const muted = token("muted");
  const mutedForeground = token("muted-foreground");
  const border = token("border");
  const card = token("card");
  const brand = token("brand");
  const destructive = token("destructive");

  // Base lightness/chroma for the language ramp. Dark themes need lighter,
  // slightly less saturated faces to stay readable against the deep ground.
  const L = isDark ? 0.68 : 0.62;
  const C = isDark ? 0.07 : 0.085;

  const langCache = new Map<string, Rgb>();
  const lang = (name: string): Rgb => {
    const hit = langCache.get(name);
    if (hit) return hit;
    const entry = LANG_HUE[name];
    const [hue, chromaScale] = entry ?? [hashedHue(name), 0.85];
    const value = flatten(
      resolveCssColor(`oklch(${L} ${C * chromaScale} ${hue})`),
      background,
    );
    langCache.set(name, value);
    return value;
  };

  // Terraces step from the card surface toward the foreground as you nest,
  // so depth is legible without any colour of its own.
  const terraceCache = new Map<number, Rgb>();
  const terrace = (depth: number): Rgb => {
    const hit = terraceCache.get(depth);
    if (hit) return hit;
    const t = Math.min(1, depth / 6);
    const value = mix(mix(card, muted, 0.55), foreground, t * (isDark ? 0.16 : 0.1));
    terraceCache.set(depth, value);
    return value;
  };

  return {
    isDark,
    background,
    foreground,
    muted,
    mutedForeground,
    border,
    card,
    brand,
    destructive,
    ground: mix(background, foreground, isDark ? 0.06 : 0.05),
    terrace,
    lang,
  };
}
