// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Choosing a tabular project's training data from the panel: which CSV
 * (`[data] path`), which column to predict (`[data] target`), and whether
 * that is a category or a number (`[data] task`).
 *
 * A project scaffolded by `axon new tabular` has no `[data]` section and
 * trains on built-in synthetic blobs until it gets one. Axon documents all
 * three keys, so they are written with `upsert` through `applyOverrides`,
 * the same path the stock networks use. Paths are stored relative to the
 * project dir, which is how the engine resolves them.
 *
 * The column and task guesses here mirror Axon's own rules (its
 * `tabular.rs`), so the preview says what training will actually do.
 *
 * The pure helpers are unit-tested; `listWorkspaceCsvs` is the one IPC call.
 */
import { filesystem } from "@/platform/filesystem";
import type { CreationOverride } from "./model-blueprint";
import { parseCsv } from "./model-tools";

/** Folders that hold generated output, not training data. */
const SKIP_DIRS = new Set(["runs", "node_modules", "target", ".git"]);

/** More distinct values than this and the column reads as a number to
 *  predict, not a set of classes, so no per-class counts are shown. Also
 *  Axon's `auto` cut-off for reading integer ids as classes. */
const MAX_CLASSES = 20;

/** Axon one-hot encodes a text column with at most this many distinct
 *  values and leaves out anything wider (IDs, free text). */
const MAX_CATEGORIES = 50;

export type Task = "classification" | "regression";

/** The spellings Axon treats as "no value". */
export function isMissingValue(v: string): boolean {
  return ["", "na", "n/a", "nan", "null", "none", "?", "-"].includes(v.trim().toLowerCase());
}

const isNumber = (v: string) => v.trim() !== "" && Number.isFinite(Number(v.trim()));

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
  /** Every value is a whole number. */
  numeric: boolean;
  /** Rows with no value in the target column (Axon skips them). */
  missing: number;
  /** What Axon's `task = "auto"` will choose for this column. */
  task: Task;
  /** Every value parses as a number, so regression is possible. */
  canRegress: boolean;
};

export type ColumnKind = "numeric" | "categorical" | "skipped";

export type ColumnSummary = {
  name: string;
  /** How Axon will read the column: a number, a category (one-hot), or
   *  left out (empty, or too many distinct text values). */
  kind: ColumnKind;
  missing: number;
  distinct: number;
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
    if (isMissingValue(v)) {
      missing++;
      continue;
    }
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const labels = [...counts.keys()];
  const numeric = labels.length > 0 && labels.every((l) => /^-?\d+$/.test(l));
  const canRegress = labels.length > 0 && labels.every(isNumber);
  const sorted = [...counts.entries()].sort(([a], [b]) =>
    numeric ? Number(a) - Number(b) : a.localeCompare(b),
  );
  return {
    classes: counts.size <= MAX_CLASSES ? sorted : null,
    distinct: counts.size,
    numeric,
    missing,
    task: canRegress && !(numeric && counts.size <= MAX_CLASSES) ? "regression" : "classification",
    canRegress,
  };
}

/** How Axon will read each column besides the target. `categorical` and
 *  `ignore` are the `[data]` overrides. */
export function summarizeColumns(
  text: string,
  target: string,
  overrides: { categorical?: readonly string[]; ignore?: readonly string[] } = {},
): ColumnSummary[] {
  const { header, rows } = parseCsv(text);
  return header
    .map((name, col): ColumnSummary | null => {
      if (name === target) return null;
      const present: string[] = [];
      let missing = 0;
      for (const row of rows) {
        const v = (row[col] ?? "").trim();
        if (isMissingValue(v)) missing++;
        else present.push(v);
      }
      const distinct = new Set(present).size;
      let kind: ColumnKind;
      if (overrides.ignore?.includes(name) || present.length === 0) kind = "skipped";
      else if (overrides.categorical?.includes(name)) kind = "categorical";
      else if (present.every(isNumber)) kind = "numeric";
      else kind = distinct <= MAX_CATEGORIES ? "categorical" : "skipped";
      return { name, kind, missing, distinct };
    })
    .filter((c): c is ColumnSummary => c !== null);
}

/** The column a new user most likely wants to predict: one with a label-ish
 *  name, else the last column (where spreadsheets usually put the answer). */
export function guessTarget(columns: readonly string[]): string | null {
  const named = columns.find((c) => /^(target|label|class|y|outcome)$/i.test(c));
  return named ?? columns[columns.length - 1] ?? null;
}

const tomlString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The `[data]` edits for a chosen CSV, target column and task. */
export function dataOverrides(
  path: string,
  target: string,
  task: Task | "auto" = "auto",
): CreationOverride[] {
  return [
    { section: "data", key: "path", value: tomlString(path), upsert: true },
    { section: "data", key: "target", value: tomlString(target), upsert: true },
    { section: "data", key: "task", value: tomlString(task), upsert: true },
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
