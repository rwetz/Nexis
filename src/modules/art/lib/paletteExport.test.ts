// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { looksLikeSvg } from "./svgExport";
import { sanitizeSvgForPreview } from "./svgSanitize";
import {
  formatPalette,
  PALETTE_FORMATS,
  slug,
  toCssVars,
  toJson,
  toSvgSwatches,
  toTailwind,
  uniqueSlugs,
  type PaletteEntry,
} from "./paletteExport";

const PALETTE: PaletteEntry[] = [
  { name: "Brand", hex: "#3b82f6" },
  { name: "Bright red", hex: "#f87171" },
];

describe("slug", () => {
  it("reduces a display name to an identifier", () => {
    expect(slug("Bright red")).toBe("bright-red");
    expect(slug("Brand / 500")).toBe("brand-500");
    expect(slug("  Spaced  Out  ")).toBe("spaced-out");
  });

  /** `--: #fff` is a CSS parse error and an invisible JSON one. */
  it("never produces an empty identifier", () => {
    expect(slug("")).toBe("color");
    expect(slug("///")).toBe("color");
  });
});

describe("uniqueSlugs", () => {
  /**
   * Losing a colour because two of them were called "Blue" is a bug found
   * much later, in the stylesheet. The first keeps the bare slug so the
   * ordinary case still reads naturally.
   */
  it("numbers duplicates instead of overwriting them", () => {
    expect(
      uniqueSlugs([
        { name: "Blue", hex: "#00f" },
        { name: "blue", hex: "#00e" },
        { name: "BLUE", hex: "#00d" },
      ]),
    ).toEqual(["blue", "blue-2", "blue-3"]);
  });

  it("preserves order and length", () => {
    expect(uniqueSlugs(PALETTE)).toEqual(["brand", "bright-red"]);
  });
});

describe("toCssVars", () => {
  it("emits a :root block of custom properties", () => {
    expect(toCssVars(PALETTE)).toBe(
      ":root {\n  --brand: #3b82f6;\n  --bright-red: #f87171;\n}",
    );
  });
});

describe("toTailwind", () => {
  it("nests under theme.extend.colors", () => {
    const out = toTailwind(PALETTE);
    expect(out).toContain("extend: {");
    expect(out).toContain('"brand": "#3b82f6",');
    expect(out).toContain('"bright-red": "#f87171",');
  });
});

describe("toJson", () => {
  it("emits a flat, parseable object keyed by slug", () => {
    expect(JSON.parse(toJson(PALETTE))).toEqual({
      brand: "#3b82f6",
      "bright-red": "#f87171",
    });
  });

  it("keeps every entry when names collide", () => {
    const parsed = JSON.parse(
      toJson([
        { name: "Blue", hex: "#00f" },
        { name: "Blue", hex: "#00e" },
      ]),
    );
    expect(Object.keys(parsed)).toHaveLength(2);
  });
});

describe("toSvgSwatches", () => {
  it("is a complete document the rest of the pack accepts", () => {
    const svg = toSvgSwatches(PALETTE);
    expect(looksLikeSvg(svg)).toBe(true);
    expect(svg).toContain('viewBox="0 0 128 64"');
    expect(sanitizeSvgForPreview(svg).removed).toEqual([]);
  });

  it("lays swatches out left to right without gaps", () => {
    const svg = toSvgSwatches(PALETTE);
    expect(svg).toContain('x="0"');
    expect(svg).toContain('x="64"');
  });

  /** A swatch name is user text and lands inside a <title>. */
  it("escapes XML metacharacters in a name", () => {
    const svg = toSvgSwatches([{ name: 'a & b <c> "d"', hex: "#000000" }]);
    expect(svg).toContain("a &amp; b &lt;c&gt; &quot;d&quot;");
    expect(looksLikeSvg(svg)).toBe(true);
  });

  it("stays a valid document when the palette is empty", () => {
    expect(looksLikeSvg(toSvgSwatches([]))).toBe(true);
  });
});

describe("formatPalette", () => {
  it("produces non-empty output for every format", () => {
    for (const f of PALETTE_FORMATS) {
      expect(formatPalette(PALETTE, f).length, f).toBeGreaterThan(0);
    }
  });
});
