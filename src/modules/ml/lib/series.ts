// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Metric series buffers for live training charts.
 *
 * Stored OUTSIDE Zustand on purpose (pitfall #14): a high-frequency
 * mutable buffer must never be returned from a selector. Components
 * subscribe to a primitive `seriesTick` counter in the store and read
 * these buffers imperatively when it changes.
 *
 * Memory is bounded (pitfall #7 in spirit): each series is capped at
 * MAX_POINTS via min/max-preserving decimation. Full fidelity always
 * remains on disk in the run's metrics.jsonl.
 */

export type Series = {
  steps: number[];
  values: number[];
};

/** Decimate when a series exceeds this many points. */
export const MAX_POINTS = 8192;

export function createSeriesMap(): Map<string, Series> {
  return new Map();
}

export function appendPoint(
  map: Map<string, Series>,
  name: string,
  step: number,
  value: number,
): void {
  if (!Number.isFinite(value)) return;
  let s = map.get(name);
  if (!s) {
    s = { steps: [], values: [] };
    map.set(name, s);
  }
  s.steps.push(step);
  s.values.push(value);
  if (s.steps.length > MAX_POINTS) {
    const d = decimateHalf(s);
    s.steps = d.steps;
    s.values = d.values;
  }
}

/**
 * Halve a series while preserving shape: for every group of 4 points,
 * keep the min-value and max-value points (in step order), so loss
 * spikes survive the downsample instead of averaging away.
 */
export function decimateHalf(s: Series): Series {
  const n = s.steps.length;
  const steps: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < n; i += 4) {
    const end = Math.min(i + 4, n);
    if (end - i <= 2) {
      for (let j = i; j < end; j++) {
        steps.push(s.steps[j]);
        values.push(s.values[j]);
      }
      continue;
    }
    let minIdx = i;
    let maxIdx = i;
    for (let j = i + 1; j < end; j++) {
      if (s.values[j] < s.values[minIdx]) minIdx = j;
      if (s.values[j] > s.values[maxIdx]) maxIdx = j;
    }
    const a = Math.min(minIdx, maxIdx);
    const b = Math.max(minIdx, maxIdx);
    steps.push(s.steps[a]);
    values.push(s.values[a]);
    if (b !== a) {
      steps.push(s.steps[b]);
      values.push(s.values[b]);
    }
  }
  return { steps, values };
}

/**
 * Bin a series down to at most `bins` min/max pairs for rendering.
 * Returns [stepA, valA, stepB, valB, ...] flattened in draw order.
 */
export function binForRender(s: Series, bins: number): Series {
  const n = s.steps.length;
  if (n <= bins * 2) return s;
  const steps: number[] = [];
  const values: number[] = [];
  const per = n / bins;
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(Math.floor((b + 1) * per), n);
    if (start >= end) continue;
    let minIdx = start;
    let maxIdx = start;
    for (let j = start + 1; j < end; j++) {
      if (s.values[j] < s.values[minIdx]) minIdx = j;
      if (s.values[j] > s.values[maxIdx]) maxIdx = j;
    }
    const a = Math.min(minIdx, maxIdx);
    const c = Math.max(minIdx, maxIdx);
    steps.push(s.steps[a]);
    values.push(s.values[a]);
    if (c !== a) {
      steps.push(s.steps[c]);
      values.push(s.values[c]);
    }
  }
  return { steps, values };
}
