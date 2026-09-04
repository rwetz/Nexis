// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Colour maths for the palette panel: parsing, harmonies, and contrast.
 *
 * Deliberately DOM-free. Resolving a *themed* colour (`oklch(…)`, a custom
 * property) needs a browser and lives in `resolveCssColor.ts`; everything from
 * "I have an sRGB triple" onwards is arithmetic, and arithmetic is the half
 * that is easy to get quietly wrong. Contrast especially: a palette tool that
 * reports the wrong ratio is worse than one that reports none, because it is
 * believed.
 *
 * ## HSL, not OKLCH, for the harmonies
 *
 * Perceptual spaces are the better answer for *interpolation* — an OKLCH ramp
 * has none of the muddy midpoints an HSL one does. Harmonies are a different
 * job: they are defined as rotations on the classical colour wheel, and that
 * wheel is HSL's hue circle. Rotating 120 degrees in OKLCH gives a defensible
 * colour that is not the triad anybody means. So hue rotation happens in HSL,
 * on purpose, and the module says so rather than leaving it looking like an
 * oversight.
 *
 * Contrast, by contrast, is not a matter of taste: WCAG 2.x defines it on
 * sRGB relative luminance and that definition is what accessibility is
 * measured against, so it is implemented exactly rather than improved on.
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

// ── Parsing and formatting ──────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp255 = (v: number) => clamp(Math.round(v), 0, 255);

/**
 * Parse `#rgb`, `#rrggbb`, `#rrggbbaa`, or `rgb()/rgba()`.
 *
 * Alpha is accepted and discarded rather than rejected: a palette entry copied
 * out of a stylesheet often carries one, and refusing the whole colour over a
 * channel this tool does not model would be unhelpful. Returns null for
 * anything else — `oklch()` and custom properties need the browser, which is
 * `resolveCssColor.ts`'s job, not this module's.
 */
export function parseColor(input: string): Rgb | null {
  const value = input.trim();

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const d = hex[1];
    if (d.length === 3 || d.length === 4) {
      return {
        r: Number.parseInt(d[0] + d[0], 16),
        g: Number.parseInt(d[1] + d[1], 16),
        b: Number.parseInt(d[2] + d[2], 16),
      };
    }
    if (d.length === 6 || d.length === 8) {
      return {
        r: Number.parseInt(d.slice(0, 2), 16),
        g: Number.parseInt(d.slice(2, 4), 16),
        b: Number.parseInt(d.slice(4, 6), 16),
      };
    }
    return null;
  }

  const rgb = /^rgba?\(\s*([-+]?[\d.]+)[\s,]+([-+]?[\d.]+)[\s,]+([-+]?[\d.]+)/i.exec(value);
  if (rgb) {
    const [r, g, b] = rgb.slice(1, 4).map(Number);
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return { r: clamp255(r), g: clamp255(g), b: clamp255(b) };
    }
  }

  return null;
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => clamp255(n).toString(16).padStart(2, "0")).join("")}`;
}

// ── HSL ─────────────────────────────────────────────────────────────────────

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h: h * 360, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  // Normalize the hue first so a rotation past 360 (or below 0) wraps rather
  // than clamping — every harmony below relies on that.
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = clamp(s, 0, 1);
  const lum = clamp(l, 0, 1);

  if (sat === 0) {
    const v = clamp255(lum * 255);
    return { r: v, g: v, b: v };
  }

  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  const channel = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  return {
    r: clamp255(channel(hue + 1 / 3) * 255),
    g: clamp255(channel(hue) * 255),
    b: clamp255(channel(hue - 1 / 3) * 255),
  };
}

/** Rotate the hue, keeping saturation and lightness. */
export function rotateHue(hex: string, degrees: number): string {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return toHex(hslToRgb({ ...hsl, h: hsl.h + degrees }));
}

/** Move toward white (positive) or black (negative), by a 0..1 amount. */
export function shift(hex: string, amount: number): string {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return toHex(hslToRgb({ ...hsl, l: clamp(hsl.l + amount, 0, 1) }));
}

/** Linear sRGB-space blend. `t` of 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  const k = clamp(t, 0, 1);
  return toHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

// ── Harmonies ───────────────────────────────────────────────────────────────

export const HARMONIES = [
  "complementary",
  "analogous",
  "triadic",
  "tetradic",
  "split-complementary",
  "monochromatic",
] as const;

export type Harmony = (typeof HARMONIES)[number];

export const HARMONY_LABELS: Record<Harmony, string> = {
  "complementary": "Complementary",
  "analogous": "Analogous",
  "triadic": "Triadic",
  "tetradic": "Tetradic",
  "split-complementary": "Split",
  "monochromatic": "Mono",
};

/**
 * A set built around a base colour, which is always *in* the result.
 *
 * The rotational harmonies put it first, so the caller can show it as the
 * anchor. `monochromatic` is the exception and deliberately so: it is a
 * lightness ramp, and a ramp is only usable as a scale if it is ordered, so
 * the base sits in the middle (index 2) rather than being dragged to the
 * front. Test the membership, not the position.
 */
export function harmony(base: string, kind: Harmony): string[] {
  const rgb = parseColor(base);
  if (!rgb) return [base];
  const hex = toHex(rgb);

  switch (kind) {
    case "complementary":
      return [hex, rotateHue(hex, 180)];
    case "analogous":
      return [hex, rotateHue(hex, -30), rotateHue(hex, 30)];
    case "triadic":
      return [hex, rotateHue(hex, 120), rotateHue(hex, 240)];
    case "tetradic":
      return [hex, rotateHue(hex, 90), rotateHue(hex, 180), rotateHue(hex, 270)];
    case "split-complementary":
      return [hex, rotateHue(hex, 150), rotateHue(hex, 210)];
    case "monochromatic": {
      // A lightness ramp rather than five random tints, so the result is a
      // usable scale: two steps down, the base, two steps up.
      const hsl = rgbToHsl(rgb);
      return [-0.24, -0.12, 0, 0.12, 0.24].map((d) =>
        toHex(hslToRgb({ ...hsl, l: clamp(hsl.l + d, 0.04, 0.96) })),
      );
    }
  }
}

// ── Contrast (WCAG 2.x) ─────────────────────────────────────────────────────

/**
 * sRGB relative luminance, exactly as WCAG defines it.
 *
 * The 0.03928 threshold and the 2.4 exponent are from the specification. They
 * are not a rounding of something nicer, and "improving" them to a perceptual
 * lightness would make every number this tool reports disagree with every
 * other accessibility checker in the world.
 */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagVerdict = {
  ratio: number;
  /** Body text: 4.5 for AA, 7 for AAA. */
  normal: "AAA" | "AA" | "fail";
  /** 18pt, or 14pt bold: 3 for AA, 4.5 for AAA. */
  large: "AAA" | "AA" | "fail";
  /** UI components and graphical objects, AA only: 3. */
  ui: "AA" | "fail";
};

export function wcag(a: string, b: string): WcagVerdict {
  const ratio = contrastRatio(a, b);
  return {
    ratio,
    normal: ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "fail",
    large: ratio >= 4.5 ? "AAA" : ratio >= 3 ? "AA" : "fail",
    ui: ratio >= 3 ? "AA" : "fail",
  };
}

/** Black or white, whichever is legible on this colour. */
export function readableOn(background: string): string {
  return contrastRatio(background, "#ffffff") >=
    contrastRatio(background, "#000000")
    ? "#ffffff"
    : "#000000";
}

/**
 * Ratios are conventionally quoted to one decimal, as `4.5:1` — and this
 * **truncates rather than rounds**, which is the whole point.
 *
 * WCAG's thresholds sit exactly on one-decimal values (3, 4.5, 7). Rounding
 * 4.47 to "4.5:1" puts a number on screen that reads as a pass beside a badge
 * that says fail, and the user believes the number. Truncating can only ever
 * understate, so a displayed value at or above a threshold always genuinely
 * meets it — the badge and the figure can never contradict each other.
 */
export function formatRatio(ratio: number): string {
  return `${Math.floor(ratio * 10) / 10}:1`;
}
