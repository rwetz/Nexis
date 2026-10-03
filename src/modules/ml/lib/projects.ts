// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Finding ML projects and reading their run store, with no store state.
 *
 * The panel's store and the chat tools (`model-tools.ts`) both need "which
 * projects are in this workspace, and what runs do they have". The store
 * layers selection and race guards on top; the tools just read. Keeping the
 * reads here means a chat question can never change what the panel shows.
 */
import { basename } from "@/lib/path";
import { filesystem } from "@/platform/filesystem";
import { readTextFile } from "./fs";
import { readRunMeta } from "./notes";
import type { MetricStats, RunSummary } from "./protocol";

export type MlProject = {
  /** Absolute-ish path Nexis uses for fs/spawn calls. */
  dir: string;
  /** Short display name (directory basename). */
  name: string;
  /** An exported model.onnx exists in the project dir. */
  hasOnnx: boolean;
};

export type HistoricalRun = {
  id: string;
  dir: string;
  status: string;
  metrics?: Record<string, MetricStats>;
  lastEpoch?: number | null;
  totalEpochs?: number | null;
  device?: string | null;
  startedAt?: string;
  finishedAt?: string;
  /** Per-run metadata from notes.json. */
  note?: string;
  tags?: string[];
  pinned?: boolean;
};

export const MAX_RUNS_LISTED = 50;

/** Subdirectories that can't plausibly be ML projects. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "target", "coverage"]);

export async function fileExists(path: string): Promise<boolean> {
  try {
    await filesystem.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * A dir is an ML project when it has a `train.toml` — the engine-agnostic
 * marker both engines scaffold. The Rust engine's projects are config-only
 * (NO train.py), so checking train.py alone made them invisible and the
 * panel showed the first-model create card next to a fully trained model.
 * train.py is kept as a fallback for old Python projects.
 */
async function isMlProject(dir: string): Promise<boolean> {
  if (await fileExists(`${dir}/train.toml`)) return true;
  return fileExists(`${dir}/train.py`);
}

/** Build the MlProject record for a discovered dir (ONNX badge included). */
async function toProject(dir: string, name: string): Promise<MlProject> {
  return { dir, name, hasOnnx: await fileExists(`${dir}/model.onnx`) };
}

/** The workspace root itself (if it is a project) plus its direct children. */
export async function discoverProjects(workspaceRoot: string): Promise<MlProject[]> {
  const found: MlProject[] = [];
  if (await isMlProject(workspaceRoot)) {
    found.push(await toProject(workspaceRoot, basename(workspaceRoot)));
  }
  try {
    const entries = await filesystem.readDir(workspaceRoot, false);
    const candidates = entries
      .filter(
        (e) =>
          e.kind === "dir" && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name),
      )
      .slice(0, 40);
    const checks = await Promise.all(
      candidates.map(async (e) => ({
        entry: e,
        ok: await isMlProject(`${workspaceRoot}/${e.name}`),
      })),
    );
    const projects = await Promise.all(
      checks
        .filter((c) => c.ok)
        .map((c) => toProject(`${workspaceRoot}/${c.entry.name}`, c.entry.name)),
    );
    found.push(...projects);
  } catch {
    // unreadable workspace root — keep whatever we found
  }
  return found;
}

/** Pinned runs first; order is otherwise preserved (the input is already
 *  newest-first), relying on Array.prototype.sort being stable. */
export function sortRuns(runs: HistoricalRun[]): HistoricalRun[] {
  // Boolean-coerce: a missing `pinned` must read as 0, not NaN (which
  // would make the comparator inconsistent and leave the list unsorted).
  return runs.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

/**
 * A project's runs, pinned first then newest first. Throws when
 * `.nexis-ml/runs` doesn't exist yet, which callers treat as "no runs".
 */
export async function readRuns(projectDir: string): Promise<HistoricalRun[]> {
  const runsDir = `${projectDir}/.nexis-ml/runs`;
  const entries = await filesystem.readDir(runsDir, true);
  const dirs = entries
    .filter((e) => e.kind === "dir")
    .map((e) => e.name)
    .sort()
    .reverse()
    .slice(0, MAX_RUNS_LISTED);
  const runs: HistoricalRun[] = await Promise.all(
    dirs.map(async (name) => {
      const dir = `${runsDir}/${name}`;
      const base: HistoricalRun = { id: name, dir, status: "unknown" };
      // notes.json is independent of summary.json (a crashed run can
      // still be annotated/pinned); the two files are independent, so
      // read them concurrently.
      const [meta, summaryText] = await Promise.all([
        readRunMeta(dir),
        readTextFile(`${dir}/summary.json`),
      ]);
      const withMeta = { note: meta.note, tags: meta.tags, pinned: meta.pinned };
      if (summaryText !== null) {
        try {
          const summary = JSON.parse(summaryText) as RunSummary;
          return {
            ...base,
            ...withMeta,
            status: summary.status ?? "unknown",
            metrics: summary.metrics,
            lastEpoch: summary.lastEpoch,
            totalEpochs: summary.totalEpochs,
            device: summary.device,
            startedAt: summary.startedAt,
            finishedAt: summary.finishedAt,
          };
        } catch {
          // malformed summary → keep "unknown"
        }
      }
      return { ...base, ...withMeta };
    }),
  );
  return sortRuns(runs);
}
