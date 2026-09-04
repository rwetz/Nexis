// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  formatRatio,
  HARMONIES,
  harmony,
  hslToRgb,
  mix,
  parseColor,
  readableOn,
  relativeLuminance,
  rgbToHsl,
  rotateHue,
  shift,
  toHex,
  wcag,
} from "./color";

describe("parseColor", () => {
  it("reads the hex spellings", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#3b82f6")).toEqual({ r: 59, g: 130, b: 246 });
    expect(parseColor("#3B82F6")).toEqual({ r: 59, g: 130, b: 246 });
  });

  /**
   * A palette entry copied out of a stylesheet often carries alpha. Refusing
   * the whole colour over a channel this tool does not model would be
   * unhelpful, so it is accepted and dropped.
   */
  it("accepts and discards alpha", () => {
    expect(parseColor("#3b82f680")).toEqual({ r: 59, g: 130, b: 246 });
    expect(parseColor("#f00c")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor("rgba(59, 130, 246, 0.5)")).toEqual({
      r: 59,
      g: 130,
      b: 246,
    });
  });

  it("reads rgb() with either separator", () => {
    expect(parseColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3 });
    expect(parseColor("rgb(1 2 3)")).toEqual({ r: 1, g: 2, b: 3 });
  });

  it("clamps out-of-gamut rgb() channels", () => {
    expect(parseColor("rgb(300, -5, 128)")).toEqual({ r: 255, g: 0, b: 128 });
  });

  /**
   * Not a gap: oklch and custom properties need a browser to resolve, which is
   * `resolveCssColor.ts`. Returning null here is what routes them there rather
   * than half-parsing them into a wrong colour.
   */
  it("returns null for anything needing the browser", () => {
    expect(parseColor("oklch(0.7 0.1 200)")).toBeNull();
    expect(parseColor("var(--primary)")).toBeNull();
    expect(parseColor("rebeccapurple")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
  });
});

describe("hsl round trip", () => {
  it("survives a round trip for a range of colours", () => {
    for (const hex of ["#3b82f6", "#eab308", "#000000", "#ffffff", "#808080"]) {
      const rgb = parseColor(hex);
      expect(rgb).not.toBeNull();
      expect(toHex(hslToRgb(rgbToHsl(rgb!)))).toBe(hex);
    }
  });

  it("reports grey as unsaturated with hue zero", () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toEqual({
      h: 0,
      s: 0,
      l: 128 / 255,
    });
  });

  /** Every harmony is a hue rotation, so wrapping past the circle must work. */
  it("wraps a hue past the circle rather than clamping", () => {
    expect(toHex(hslToRgb({ h: 380, s: 1, l: 0.5 }))).toBe(
      toHex(hslToRgb({ h: 20, s: 1, l: 0.5 })),
    );
    expect(toHex(hslToRgb({ h: -20, s: 1, l: 0.5 }))).toBe(
      toHex(hslToRgb({ h: 340, s: 1, l: 0.5 })),
    );
  });
});

describe("transforms", () => {
  it("rotates a hue by a half turn to its opposite", () => {
    expect(rotateHue("#ff0000", 180)).toBe("#00ffff");
  });

  it("leaves an unparseable colour alone rather than guessing", () => {
    expect(rotateHue("nope", 90)).toBe("nope");
    expect(shift("nope", 0.2)).toBe("nope");
    expect(mix("nope", "#fff", 0.5)).toBe("nope");
  });

  it("shifts lightness toward white and black, clamped", () => {
    expect(shift("#808080", 1)).toBe("#ffffff");
    expect(shift("#808080", -1)).toBe("#000000");
  });

  it("mixes endpoints exactly and midpoints evenly", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("harmony", () => {
  it("always includes the base colour", () => {
    for (const kind of HARMONIES) {
      expect(harmony("#3b82f6", kind), kind).toContain("#3b82f6");
    }
  });

  it("puts the base first for the rotational harmonies", () => {
    for (const kind of HARMONIES.filter((k) => k !== "monochromatic")) {
      expect(harmony("#3b82f6", kind)[0], kind).toBe("#3b82f6");
    }
    // The ramp is ordered by lightness instead, so its base sits mid-scale.
    expect(harmony("#3b82f6", "monochromatic")[2]).toBe("#3b82f6");
  });

  it("produces the classical rotations", () => {
    expect(harmony("#ff0000", "complementary")).toEqual(["#ff0000", "#00ffff"]);
    expect(harmony("#ff0000", "triadic")).toEqual([
      "#ff0000",
      "#00ff00",
      "#0000ff",
    ]);
    expect(harmony("#ff0000", "tetradic")).toHaveLength(4);
    expect(harmony("#ff0000", "analogous")).toHaveLength(3);
    expect(harmony("#ff0000", "split-complementary")).toHaveLength(3);
  });

  /**
   * A ramp, not five random tints — the point of a mono set is that it is
   * usable as a scale, so it has to be ordered and it has to keep its ends off
   * pure black and white.
   */
  it("builds monochromatic as an ordered lightness ramp", () => {
    const ramp = harmony("#3b82f6", "monochromatic");
    expect(ramp).toHaveLength(5);
    const lightness = ramp.map((h) => rgbToHsl(parseColor(h)!).l);
    for (let i = 1; i < lightness.length; i++) {
      expect(lightness[i]).toBeGreaterThan(lightness[i - 1]);
    }
    expect(lightness[0]).toBeGreaterThan(0);
    expect(lightness[4]).toBeLessThan(1);
  });

  it("returns the input alone when it cannot be parsed", () => {
    expect(harmony("nope", "triadic")).toEqual(["nope"]);
  });
});

describe("contrast", () => {
  /**
   * The WCAG definition, checked against its own published anchors. These
   * numbers are not ours to round or improve: a palette tool that disagrees
   * with every other checker is worse than one that reports nothing.
   */
  it("matches the WCAG anchors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // The canonical mid-grey example: #767676 on white is exactly AA at 4.54.
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#123456", "#abcdef")).toBeCloseTo(
      contrastRatio("#abcdef", "#123456"),
      10,
    );
  });

  it("puts luminance endpoints at 0 and 1", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 10);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10);
  });

  it("grades each WCAG threshold", () => {
    expect(wcag("#000000", "#ffffff")).toMatchObject({
      normal: "AAA",
      large: "AAA",
      ui: "AA",
    });
    // 4.5:1 — passes AA body text, misses AAA.
    expect(wcag("#767676", "#ffffff").normal).toBe("AA");
    // 3:1 — large text and UI only.
    expect(wcag("#949494", "#ffffff")).toMatchObject({
      normal: "fail",
      large: "AA",
      ui: "AA",
    });
    expect(wcag("#ffffff", "#ffffff")).toMatchObject({
      normal: "fail",
      large: "fail",
      ui: "fail",
    });
  });

  it("returns the neutral ratio rather than throwing on bad input", () => {
    expect(contrastRatio("nope", "#fff")).toBe(1);
  });

  it("picks the legible foreground", () => {
    expect(readableOn("#000000")).toBe("#ffffff");
    expect(readableOn("#ffffff")).toBe("#000000");
    expect(readableOn("#eab308")).toBe("#000000");
  });

  /**
   * Truncation, not rounding. WCAG's thresholds sit exactly on one-decimal
   * values, so rounding 4.47 up to "4.5:1" puts a passing-looking number
   * beside a failing badge — and the number is what gets believed. Found by
   * looking at a real palette: a swatch read "4.5:1" and graded fail.
   */
  it("truncates so a displayed ratio never overstates", () => {
    expect(formatRatio(21)).toBe("21:1");
    expect(formatRatio(4.4732)).toBe("4.4:1");
    expect(formatRatio(4.5)).toBe("4.5:1");
    expect(formatRatio(6.99)).toBe("6.9:1");
  });

  it("never shows a passing figure beside a failing grade", () => {
    // The property the truncation exists to guarantee, swept across the range
    // where the thresholds live.
    for (let r = 1; r <= 21; r += 0.01) {
      const shown = Number.parseFloat(formatRatio(r));
      const grade = r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "fail";
      if (grade === "fail") expect(shown, `${r}`).toBeLessThan(4.5);
      if (grade === "AA") expect(shown, `${r}`).toBeLessThan(7);
    }
  });
});
