// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Choosing a tabular project's training data from the panel: which CSV
 * (`[data] path`) and which column to predict (`[data] target`).
 *
 * A project scaffolded by `nexis-ml new tabular` has no `[data]` section and
 * trains on built-in synthetic blobs until it gets one. Both keys are
 * documented by both engines, so they are written with `upsert` through
 * `applyOverrides`, the same path the stock networks use. Paths are stored
 * relative to the project dir, which is how the engines resolve them.
 *
 * The pure helpers are unit-tested; `listWorkspaceCsvs` is the one IPC call.
 */
import { filesystem } from "@/platform/filesystem";
import type { CreationOverride } from "./model-blueprint";
import { parseCsv } from "./model-tools";

/** Folders that hold generated output, not training data. */
const SKIP_DIRS = new Set(["runs", "node_modules", "target", ".git"]);

/** More distinct values than this and the column reads as a number to
 *  predict, not a set of classes, so no per-class counts are shown. */
const MAX_CLASSES = 20;

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/** Path segments for comparison. Drive letters compare case-insensitively
 *  (Windows paths can arrive as `C:` or `c:`); everything else is exact. */
function segments(p: string): string[] {
  return norm(p)
    .split("/")
    .filter((s, i) => s !== "" || i === 0)
    .map((s, i) => (i === 0 && /^[a-z]:$/i.test(s) ? s.toUpperCase() : s));
}

/**
 * `file` relative to `dir`, with forward slashes (`data/plants.csv`,
 * `../shared/plants.csv`). Null when the two share no root (another drive),
 * because the engine can't follow a relative path there.
 */
export function relativeDataPath(dir: string, file: string): string | null {
  const from = segments(dir);
  const to = segments(file);
  if (from[0] !== to[0]) return null;
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) {
    common++;
  }
  const up = from.slice(common).map(() => "..");
  return [...up, ...to.slice(common)].join("/");
}

/** Whether a workspace-relative CSV path is a plausible dataset. */
export function isCandidateCsv(rel: string): boolean {
  if (!/\.csv$/i.test(rel)) return false;
  return !norm(rel)
    .split("/")
    .slice(0, -1)
    .some((s) => SKIP_DIRS.has(s));
}

export type CsvSummary = {
  columns: string[];
  rows: number;
};

export type TargetSummary = {
  /** `[label, count]` pairs sorted by label, or null when the column has
   *  too many distinct values to be a class label. */
  classes: [string, number][] | null;
  distinct: number;
  /** Every value is a whole number. Both engines read class ids (0..k-1);
   *  text labels are not something they document. */
  numeric: boolean;
  /** Rows with no value in the target column. */
  missing: number;
};

export function summarizeCsv(text: string): CsvSummary {
  const { header, rows } = parseCsv(text);
  return { columns: header, rows: rows.length };
}

export function summarizeTarget(text: string, target: string): TargetSummary | null {
  const { header, rows } = parseCsv(text);
  const col = header.indexOf(target);
  if (col < 0) return null;
  const counts = new Map<string, number>();
  let missing = 0;
  for (const row of rows) {
    const v = (row[col] ?? "").trim();
    if (v === "") {
      missing++;
      continue;
    }
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const labels = [...counts.keys()];
  const numeric = labels.length > 0 && labels.every((l) => /^-?\d+$/.test(l));
  const sorted = [...counts.entries()].sort(([a], [b]) =>
    numeric ? Number(a) - Number(b) : a.localeCompare(b),
  );
  return {
    classes: counts.size <= MAX_CLASSES ? sorted : null,
    distinct: counts.size,
    numeric,
    missing,
  };
}

/** The column a new user most likely wants to predict: one with a label-ish
 *  name, else the last column (where spreadsheets usually put the answer). */
export function guessTarget(columns: readonly string[]): string | null {
  const named = columns.find((c) => /^(target|label|class|y|outcome)$/i.test(c));
  return named ?? columns[columns.length - 1] ?? null;
}

const tomlString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The `[data]` edits for a chosen CSV and target column. */
export function dataOverrides(path: string, target: string): CreationOverride[] {
  return [
    { section: "data", key: "path", value: tomlString(path), upsert: true },
    { section: "data", key: "target", value: tomlString(target), upsert: true },
  ];
}

/** CSVs in the workspace, as absolute paths with forward slashes. */
export async function listWorkspaceCsvs(workspaceRoot: string): Promise<string[]> {
  const res = await filesystem.glob({ pattern: "**/*.csv", root: workspaceRoot, maxResults: 300 });
  const root = norm(workspaceRoot);
  return res.hits
    .filter((h) => isCandidateCsv(h.rel))
    .map((h) => `${root}/${norm(h.rel)}`);
}
