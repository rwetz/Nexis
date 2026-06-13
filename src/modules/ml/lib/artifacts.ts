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
 * Today that's the per-epoch confusion matrix (a `tabular`/`image`
 * classification artifact); image grids and others land here later.
 */
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";

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

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

/**
 * Read + parse a confusion-matrix artifact file. Resolves to null for
 * any failure (missing file, non-text, malformed JSON) so callers can
 * treat "no matrix" uniformly.
 */
export async function readConfusionMatrix(
  path: string,
): Promise<ConfusionMatrix | null> {
  let res: ReadResult;
  try {
    res = await invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    });
  } catch {
    return null;
  }
  if (res.kind !== "text") return null;
  try {
    return parseConfusionMatrix(JSON.parse(res.content));
  } catch {
    return null;
  }
}
