// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Braille-cell chart rendering — the btop idiom, deliberately chosen over a
 * canvas or SVG chart.
 *
 * A braille cell packs a 2×4 dot matrix into one character, so a monospace
 * row of N characters carries 2N data columns at 4× vertical resolution. For
 * a panel that redraws every second, that means the whole chart is a string:
 * no canvas context, no layout thrash, no per-frame allocation beyond the
 * string itself, and it inherits the terminal's font and the active theme's
 * colors for free.
 *
 * This module is pure so the geometry is testable without a DOM — every
 * off-by-one in dot mapping is a silently wrong chart otherwise.
 */

/** U+2800 BRAILLE PATTERN BLANK. Every braille glyph is this plus a bitmask. */
const BRAILLE_BASE = 0x2800;

/**
 * Braille dot numbering is historical, not raster order — the bits run down
 * the left column, then down the right, with dots 7/8 appended underneath by
 * the later 8-dot extension:
 *
 *     1 4        0x01 0x08
 *     2 5   ->   0x02 0x10
 *     3 6        0x04 0x20
 *     7 8        0x40 0x80
 *
 * So a top-to-bottom scan of one column is NOT a contiguous bit range. These
 * two tables are that mapping written down once, in visual order.
 */
const LEFT_COLUMN_TOP_TO_BOTTOM = [0x01, 0x02, 0x04, 0x40];
const RIGHT_COLUMN_TOP_TO_BOTTOM = [0x08, 0x10, 0x20, 0x80];

/** Vertical dots per braille cell — the 4 in "2×4". */
const DOTS_PER_ROW = 4;
/** Horizontal data columns per braille cell — the 2 in "2×4". */
const COLUMNS_PER_CELL = 2;

export type BrailleChartOptions = {
  /** Height in character rows. Vertical resolution is `rows * 4` dots. */
  rows: number;
  /** Width in characters. Holds `cols * 2` data points. */
  cols: number;
  /**
   * Value mapped to a full-height column. Values above it clamp rather than
   * overflow. Pass the axis maximum (100 for a CPU percentage), or a rolling
   * peak for unbounded series like network throughput.
   */
  max: number;
};

/**
 * Render `values` as an array of `rows` strings, top row first.
 *
 * The series is right-aligned: with more data points than the chart can hold,
 * the oldest are dropped, so a live chart scrolls left as new samples arrive
 * and a partially-filled chart grows from the right edge. Both match how
 * btop, and every terminal grapher, behave — a left-aligned live chart would
 * appear to freeze once it filled.
 */
export function brailleChart(
  values: readonly number[],
  { rows, cols, max }: BrailleChartOptions,
): string[] {
  if (rows <= 0 || cols <= 0) return [];

  const totalDots = rows * DOTS_PER_ROW;
  const dataColumns = cols * COLUMNS_PER_CELL;

  // Right-align: keep the newest `dataColumns` samples, and record how many
  // leading columns stay blank while the buffer is still filling.
  const visible = values.slice(-dataColumns);
  const padding = dataColumns - visible.length;

  /** Filled dot count for data column `i`, or 0 for the blank left padding. */
  const heightAt = (i: number): number => {
    const index = i - padding;
    if (index < 0) return 0;
    const value = visible[index];
    if (!Number.isFinite(value) || value <= 0) return 0;
    // A non-zero-but-tiny value must still show one dot: a chart that renders
    // 0.3% CPU identically to 0% hides exactly the low-level churn this panel
    // exists to make visible.
    if (max <= 0) return 0;
    const scaled = Math.round((value / max) * totalDots);
    return Math.min(totalDots, Math.max(1, scaled));
  };

  const out: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let cell = 0; cell < cols; cell++) {
      let mask = 0;
      for (let sub = 0; sub < COLUMNS_PER_CELL; sub++) {
        const height = heightAt(cell * COLUMNS_PER_CELL + sub);
        const masks = sub === 0 ? LEFT_COLUMN_TOP_TO_BOTTOM : RIGHT_COLUMN_TOP_TO_BOTTOM;
        for (let slot = 0; slot < DOTS_PER_ROW; slot++) {
          // Absolute dot index from the top of the chart. The column is
          // filled from the bottom, so this dot is lit when it falls within
          // the topmost `height` dots measured up from the floor.
          const fromTop = row * DOTS_PER_ROW + slot;
          if (fromTop >= totalDots - height) mask |= masks[slot];
        }
      }
      line += String.fromCharCode(BRAILLE_BASE + mask);
    }
    out.push(line);
  }
  return out;
}

/** Single-row convenience form, for inline sparklines in table cells. */
export function brailleSparkline(
  values: readonly number[],
  cols: number,
  max: number,
): string {
  return brailleChart(values, { rows: 1, cols, max })[0] ?? "";
}
