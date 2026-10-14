// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Reading run artifacts the engine wrote to disk. Artifacts are files
 * referenced by path in the protocol (never inlined), so the panel loads
 * them through the same `fs_read_file` IPC the run browser already uses.
 *
 * The per-epoch confusion matrix (classification), residuals (regression)
 * and network weights. Image grids are shown directly as <img>.
 */
import { readTextFile } from "./fs";
import { parseWeights, type WeightsFile } from "./netgraph";

/** Shape the engine writes for a `confusion-matrix` artifact:
 *  `{ labels: [...], matrix: [[...], ...] }`, rows = actual class,
 *  columns = predicted class. */
export type ConfusionMatrix = {
  labels: string[];
  matrix: number[][];
};

/**
 * Validate + normalize a confusion-matrix artifact's parsed JSON.
 * Returns null on any shape mismatch (a ragged matrix, non-numeric
 * cells, empty labels) — untrusted file contents must never throw into
 * the render path. Labels are coerced to strings (the engine may emit
 * numeric class labels).
 */
export function parseConfusionMatrix(raw: unknown): ConfusionMatrix | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as { labels?: unknown; matrix?: unknown };
  if (!Array.isArray(o.labels) || !Array.isArray(o.matrix)) return null;
  const labels = o.labels.map((l) => String(l));
  const k = labels.length;
  if (k === 0 || o.matrix.length !== k) return null;
  const matrix: number[][] = [];
  for (const row of o.matrix) {
    if (!Array.isArray(row) || row.length !== k) return null;
    const nums: number[] = [];
    for (const v of row) {
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      nums.push(v);
    }
    matrix.push(nums);
  }
  return { labels, matrix };
}

/**
 * Read + parse a confusion-matrix artifact file. Resolves to null for
 * any failure (missing file, non-text, malformed JSON) so callers can
 * treat "no matrix" uniformly.
 */
export async function readConfusionMatrix(
  path: string,
): Promise<ConfusionMatrix | null> {
  const content = await readTextFile(path);
  if (content === null) return null;
  try {
    return parseConfusionMatrix(JSON.parse(content));
  } catch {
    return null;
  }
}

/** Shape Axon writes for a `residuals` artifact (regression): validation
 *  rows' real and predicted values, in the target's own units. */
export type Residuals = {
  target: string | null;
  actual: number[];
  predicted: number[];
};

/** Validate a residuals artifact's parsed JSON; null on any mismatch. Pairs
 *  with a non-finite value are dropped rather than failing the whole plot. */
export function parseResiduals(raw: unknown): Residuals | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as { target?: unknown; actual?: unknown; predicted?: unknown };
  if (!Array.isArray(o.actual) || !Array.isArray(o.predicted)) return null;
  if (o.actual.length !== o.predicted.length) return null;
  const actual: number[] = [];
  const predicted: number[] = [];
  for (let i = 0; i < o.actual.length; i++) {
    const a = o.actual[i];
    const p = o.predicted[i];
    if (typeof a === "number" && typeof p === "number" && Number.isFinite(a) && Number.isFinite(p)) {
      actual.push(a);
      predicted.push(p);
    }
  }
  if (actual.length === 0) return null;
  return { target: typeof o.target === "string" ? o.target : null, actual, predicted };
}

/** Read + parse a `residuals` artifact file; null on any failure. */
export async function readResiduals(path: string): Promise<Residuals | null> {
  const content = await readTextFile(path);
  if (content === null) return null;
  try {
    return parseResiduals(JSON.parse(content));
  } catch {
    return null;
  }
}

/**
 * Read + parse a `weights` artifact (the network graph's Tier-2 overlay;
 * format contract in ML_SUITE.md §weights-artifact). Same null-on-anything
 * contract as readConfusionMatrix. No engine emits this yet — the graph
 * renders structure-only until one does.
 */
export async function readWeights(path: string): Promise<WeightsFile | null> {
  const content = await readTextFile(path);
  if (content === null) return null;
  try {
    return parseWeights(JSON.parse(content));
  } catch {
    return null;
  }
}
