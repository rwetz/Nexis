// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Layout + weight bucketing for the network graph. Pure functions.
 *
 * The models this lab trains are small, but a 64-unit layer still doesn't
 * fit a 400px panel as individual circles — so each drawn node represents
 * a *bucket* of consecutive units (64 units → 13 nodes of ~5 units each),
 * and edge strength between drawn nodes is the mean |weight| over the
 * bucket pair. Full fidelity stays in the artifact file.
 */

export type DrawnColumn = {
  /** Column heading ("inputs", "hidden 1", "classes"…). */
  label: string;
  /** Real unit count, or null when unknown (draw ghost nodes). */
  total: number | null;
  /** Circles actually drawn. */
  drawn: number;
  /** Real units per drawn node (ceil(total / drawn); 1 when total ≤ max). */
  bucket: number;
};

export const MAX_DRAWN_NODES = 13;
const GHOST_NODES = 5;

export function drawnColumn(label: string, total: number | null): DrawnColumn {
  if (total == null || total <= 0) {
    return { label, total: null, drawn: GHOST_NODES, bucket: 1 };
  }
  const drawn = Math.min(total, MAX_DRAWN_NODES);
  return { label, total, drawn, bucket: Math.ceil(total / drawn) };
}

/** Columns for an MLP: inputs → hidden… → outputs. */
export function columnsForMlp(
  inputCount: number | null,
  hidden: number[],
  outputCount: number | null,
): DrawnColumn[] {
  return [
    drawnColumn("inputs", inputCount),
    ...hidden.map((h, i) =>
      drawnColumn(hidden.length > 1 ? `hidden ${i + 1}` : "hidden", h),
    ),
    drawnColumn("classes", outputCount),
  ];
}

// ── Tier 2: learned-weight overlay ────────────────────────────────────────────
//
// Contract for the engine's `weights` artifact (documented in ML_SUITE.md):
// one JSON file per eval, `{ "layers": [ { "in": I, "out": O, "w": [[…]] } ] }`
// with `w[i][j]` = weight from input-unit i to output-unit j, layers in
// forward order. Emitted with `{ ev: "artifact", kind: "weights", path }`.
// Until an engine emits it, the graph renders structure-only.

export type WeightsLayer = { in: number; out: number; w: number[][] };
export type WeightsFile = { layers: WeightsLayer[] };

/** Defensive parse — untrusted file contents must never throw into the
 *  render path (same contract as parseConfusionMatrix). */
export function parseWeights(raw: unknown): WeightsFile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const layers = (raw as { layers?: unknown }).layers;
  if (!Array.isArray(layers) || layers.length === 0) return null;
  const out: WeightsLayer[] = [];
  for (const layer of layers) {
    if (typeof layer !== "object" || layer === null) return null;
    const l = layer as { in?: unknown; out?: unknown; w?: unknown };
    if (
      typeof l.in !== "number" ||
      typeof l.out !== "number" ||
      !Array.isArray(l.w) ||
      l.w.length !== l.in
    ) {
      return null;
    }
    for (const row of l.w) {
      if (!Array.isArray(row) || row.length !== l.out) return null;
      for (const v of row) {
        if (typeof v !== "number" || !Number.isFinite(v)) return null;
      }
    }
    out.push(l as WeightsLayer);
  }
  return { layers: out };
}

/**
 * Reduce a full I×O weight matrix to drawnIn×drawnOut edge strengths in
 * [0, 1]: mean |w| over each bucket pair, normalized by the strongest
 * bucket so the boldest edge is always full-strength.
 */
export function bucketMagnitudes(
  layer: WeightsLayer,
  drawnIn: number,
  drawnOut: number,
): number[][] {
  const bucketIn = Math.ceil(layer.in / drawnIn);
  const bucketOut = Math.ceil(layer.out / drawnOut);
  const grid: number[][] = [];
  let max = 0;
  for (let a = 0; a < drawnIn; a++) {
    const row: number[] = [];
    for (let b = 0; b < drawnOut; b++) {
      let sum = 0;
      let count = 0;
      for (let i = a * bucketIn; i < Math.min((a + 1) * bucketIn, layer.in); i++) {
        for (
          let j = b * bucketOut;
          j < Math.min((b + 1) * bucketOut, layer.out);
          j++
        ) {
          sum += Math.abs(layer.w[i][j]);
          count++;
        }
      }
      const mean = count > 0 ? sum / count : 0;
      if (mean > max) max = mean;
      row.push(mean);
    }
    grid.push(row);
  }
  if (max > 0) {
    for (const row of grid) {
      for (let b = 0; b < row.length; b++) row[b] /= max;
    }
  }
  return grid;
}
