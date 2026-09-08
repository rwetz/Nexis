// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The two formatters that are genuinely Benchmark's own.
 *
 * The standalone app also carried its own `formatBytes`. That one is gone:
 * Nexis's `@/lib/format` already has one, and a second byte formatter is
 * exactly the shape pitfall #12 warns about — a helper small enough to retype
 * is a helper that gets retyped, slightly differently, somewhere else. The one
 * behavioural difference was a `digits` argument that two call sites used to
 * drop the decimal on a memory figure; Nexis's version fixes scaled units at
 * one decimal on purpose, so a column of values keeps a stable width, and that
 * is the better rule for a results table specifically.
 *
 * These two stay local because nothing else in Nexis measures a latency
 * distribution or a token rate.
 */

/** Milliseconds with adaptive precision: sub-millisecond timings are the whole
 *  point of a latency column, and `0.0 ms` says nothing. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Compact number formatting (e.g. `12.4K`) for throughput readouts. */
export function formatCompact(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1000) return n.toFixed(n % 1 === 0 ? 0 : digits);
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: digits,
  }).format(n);
}
