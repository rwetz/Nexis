// The city colours, derived from the active theme at runtime.
//
// Canvas cannot read CSS variables, so every colour here goes through the
// probe in styles/tokens.ts (the pattern DESIGN_SYSTEM.md prescribes for
// non-CSS consumers) and comes back as concrete channels we can shade
// per face. Re-read on every theme change — the renderer does exactly that,
// keyed on the provider's palette epoch so the probe runs *after* the new
// variables land on the document.
//
// Language colours are a data-viz ramp, not brand: an OKLCH ring with the
// 15deg–55deg wedge left empty so nothing in the city can be mistaken for the
// coral `--brand`, which is reserved for working-tree state and selection.
// Within that ring hues are spread as far apart as the language list allows —
// telling TypeScript from Rust at a glance is the whole point of the view.

import { resolveCssColor } from "@nexis/design/tokens";

export type Rgb = { r: number; g: number; b: number };

/** How much of the repo a language actually represents.
 *  `code` is what you wrote, `support` is what you configured, `inert` is
 *  what a tool or a camera produced. Height and footprint both key off this,
 *  so a directory of screenshots cannot out-tower your source. */
export type LangTier = "code" | "support" | "inert";

export type Palette = {
  isDark: boolean;
  background: Rgb;
  foreground: Rgb;
  border: Rgb;
  brand: Rgb;
  /** The plate everything sits on. */
  ground: Rgb;
  /** Backdrop gradient stops, top to bottom. */
  skyTop: Rgb;
  skyBottom: Rgb;
  /** Contact shadows and the vignette are painted with this, at low alpha. */
  shadow: Rgb;
  /** Distance haze blends far geometry toward this. */
  haze: Rgb;
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
export const FACE_LEFT = 0.78;
export const FACE_RIGHT = 0.54;

/** Hue in degrees, chroma multiplier, lightness offset.
 *
 *  Hues live in 56deg–374deg — the 15deg–55deg coral wedge belongs to
 *  `--brand` alone. Common languages are placed first and spread as widely as
 *  the ring allows; the rest fill the gaps between them. */
const LANG_HUE: Record<string, [number, number, number?]> = {
  // Only ~318 degrees are usable and there are thirty-odd names to place, so
  // the languages you are most likely to see side by side get the widest
  // berth and everything else is squeezed into the gaps between them.
  Rust: [74, 1, 0.01],
  Zig: [86, 0.95, -0.03],
  JavaScript: [100, 1, 0.05],
  Notebook: [112, 0.85],
  HTML: [128, 0.9, 0.02],
  Web: [140, 0.9],
  Shell: [150, 0.95],
  Make: [158, 0.75],
  CMake: [164, 0.75],
  Protobuf: [174, 0.75],
  SQL: [182, 0.8],
  Go: [192, 1],
  Dart: [202, 0.9],
  Python: [214, 1],
  Nix: [226, 0.8],
  CSS: [240, 0.95],
  Docker: [248, 0.85],
  PowerShell: [255, 0.85],
  Lua: [261, 0.85],
  TypeScript: [270, 1],
  PHP: [280, 0.85],
  Haskell: [287, 0.85],
  Kotlin: [294, 0.9],
  Terraform: [301, 0.8],
  C: [309, 0.9],
  Elixir: [316, 0.85],
  "C++": [323, 0.9],
  "C#": [331, 0.9],
  GraphQL: [339, 0.9],
  Java: [348, 0.95],
  Scala: [356, 0.9],
  Ruby: [6, 0.95],
  Swift: [13, 0.95],
  // Support files: present, legible, but visibly quieter than code. Low chroma
  // collapses hue differences, so these three separate on lightness too —
  // config and docs sit next to each other in almost every repo there is.
  JSON: [66, 0.42],
  Config: [144, 0.42, -0.07],
  Docs: [176, 0.42, 0.06],
  // Inert: hue barely matters, `readPalette` sinks these into the ground.
  Assets: [0, 0.05],
  Lockfile: [0, 0.05],
  Image: [0, 0.05],
  Font: [0, 0.05],
  Binary: [0, 0.05],
  Other: [0, 0.05],
};const SUPPORT = new Set(["JSON", "Config", "Docs"]);
// "Assets" is not a language the Rust side emits — it is the bucket the atlas
// folds every inert slice into, so it has to classify as inert too.
const INERT = new Set(["Assets", "Lockfile", "Image", "Font", "Binary", "Other"]);

/** Which tier a language belongs to. Unknown extensions land in "Other" on the
 *  Rust side, so anything that reaches here unrecognised really is code. */
export function langTier(name: string): LangTier {
  if (INERT.has(name)) return "inert";
  if (SUPPORT.has(name)) return "support";
  return "code";
}

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
  const border = token("border");
  const card = token("card");
  const brand = token("brand");

  // Base lightness/chroma for the language ramp. Dark themes need lighter,
  // slightly less saturated faces to stay readable against the deep ground.
  const L = isDark ? 0.68 : 0.6;
  const C = isDark ? 0.132 : 0.148;

  const groundColor = mix(background, foreground, isDark ? 0.06 : 0.05);

  const langCache = new Map<string, Rgb>();
  const lang = (name: string): Rgb => {
    const hit = langCache.get(name);
    if (hit) return hit;
    const entry = LANG_HUE[name];
    const [hue, chromaScale, lightDelta = 0] = entry ?? [hashedHue(name), 0.9, 0];
    let value = flatten(
      resolveCssColor(`oklch(${L + lightDelta} ${C * chromaScale} ${hue})`),
      background,
    );
    // Assets are pulled toward the plate they stand on, in whichever direction
    // that happens to be. Desaturating alone is not enough — a mid-grey on a
    // dark plate is *brighter* than most of the languages around it, and the
    // eye goes straight back to the screenshots.
    if (langTier(name) === "inert") value = mix(value, groundColor, 0.45);
    langCache.set(name, value);
    return value;
  };

  // Terraces step from the card surface toward the foreground as you nest,
  // so depth is legible without any colour of its own. They stay neutral on
  // purpose: every drop of chroma in the scene belongs to a language.
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
    border,
    brand,
    ground: groundColor,
    // A backdrop that lifts toward the top of the frame reads as sky without
    // ever being a colour of its own.
    skyTop: mix(background, foreground, isDark ? 0.085 : 0.05),
    skyBottom: background,
    shadow: isDark ? BLACK : mix(background, BLACK, 0.72),
    haze: mix(background, foreground, isDark ? 0.05 : 0.03),
    terrace,
    lang,
  };
}
