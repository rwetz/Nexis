// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { brailleChart, brailleSparkline } from "./braille";

/** Bitmask of a braille glyph — the inverse of the renderer's encoding. */
const mask = (ch: string) => ch.charCodeAt(0) - 0x2800;

describe("brailleChart", () => {
  it("renders blanks for an empty series", () => {
    expect(brailleChart([], { rows: 2, cols: 3, max: 100 })).toEqual(["⠀⠀⠀", "⠀⠀⠀"]);
  });

  it("returns nothing for a zero-sized chart", () => {
    expect(brailleChart([50], { rows: 0, cols: 4, max: 100 })).toEqual([]);
    expect(brailleChart([50], { rows: 2, cols: 0, max: 100 })).toEqual([]);
  });

  it("fills every dot at max and none at zero", () => {
    const [full] = brailleChart([100, 100], { rows: 1, cols: 1, max: 100 });
    expect(mask(full)).toBe(0xff);
    const [empty] = brailleChart([0, 0], { rows: 1, cols: 1, max: 100 });
    expect(mask(empty)).toBe(0x00);
  });

  it("clamps values above max instead of overflowing into the row above", () => {
    const rowsAt = (v: number) => brailleChart([v, v], { rows: 2, cols: 1, max: 100 });
    expect(rowsAt(500)).toEqual(rowsAt(100));
  });

  it("fills columns from the bottom up", () => {
    // One quarter height in a single-row chart = the bottom dot only:
    // dot 7 (0x40) on the left column, dot 8 (0x80) on the right.
    const [line] = brailleChart([25, 25], { rows: 1, cols: 1, max: 100 });
    expect(mask(line)).toBe(0x40 | 0x80);
  });

  it("lights the bottom row before the top row in a multi-row chart", () => {
    // 50% of a 2-row (8-dot) chart = 4 dots = exactly the bottom row full.
    const [top, bottom] = brailleChart([50, 50], { rows: 2, cols: 1, max: 100 });
    expect(mask(top)).toBe(0x00);
    expect(mask(bottom)).toBe(0xff);
  });

  it("shows at least one dot for a non-zero value too small to round up", () => {
    // 0.1 of 100 over 4 dots rounds to 0 — but rendering it as empty would
    // make low-level activity invisible, which is the regression this guards.
    const [line] = brailleChart([0.1, 0.1], { rows: 1, cols: 1, max: 100 });
    expect(mask(line)).toBe(0x40 | 0x80);
  });

  it("treats non-finite and negative samples as empty", () => {
    const [line] = brailleChart([Number.NaN, -5], { rows: 1, cols: 1, max: 100 });
    expect(mask(line)).toBe(0x00);
  });

  it("packs two data points into each cell", () => {
    // Left sub-column empty, right sub-column full.
    const [line] = brailleChart([0, 100], { rows: 1, cols: 1, max: 100 });
    expect(mask(line)).toBe(0x08 | 0x10 | 0x20 | 0x80);
  });

  it("right-aligns a partially-filled chart so it grows from the right edge", () => {
    const [line] = brailleChart([100], { rows: 1, cols: 2, max: 100 });
    // 2 cells = 4 data columns; the single sample occupies the last one,
    // filling that sub-column's full height.
    expect(mask(line[0])).toBe(0x00);
    expect(mask(line[1])).toBe(0x08 | 0x10 | 0x20 | 0x80);
  });

  it("drops the oldest samples when the series overflows the chart", () => {
    const overflowing = brailleChart([100, 100, 0, 0], { rows: 1, cols: 1, max: 100 });
    const justTheTail = brailleChart([0, 0], { rows: 1, cols: 1, max: 100 });
    expect(overflowing).toEqual(justTheTail);
  });

  it("renders empty rather than dividing by a zero max", () => {
    const [line] = brailleChart([50, 50], { rows: 1, cols: 1, max: 0 });
    expect(mask(line)).toBe(0x00);
  });

  it("produces rows of exactly `cols` characters", () => {
    const rows = brailleChart([1, 2, 3], { rows: 3, cols: 7, max: 10 });
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toHaveLength(7);
  });
});

describe("brailleSparkline", () => {
  it("is the single-row form of brailleChart", () => {
    const values = [10, 40, 90, 20];
    expect(brailleSparkline(values, 4, 100)).toBe(
      brailleChart(values, { rows: 1, cols: 4, max: 100 })[0],
    );
  });
});
