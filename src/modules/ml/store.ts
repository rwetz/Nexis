// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * ML suite store — engine detection state, the active (streaming) run,
 * and the historical run list read from `.nexis-ml/runs/`.
 *
 * Pitfall #14 note: metric buffers live in a module-level Map (see
 * lib/series.ts), NOT in this store. Components subscribe to the
 * primitive `seriesTick` counter and read buffers via `getSeriesMap()`.
 * Every selector here must return a primitive or a stored reference.
 */
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";
import type { PythonEnv } from "@/modules/python/usePythonEnv";
import {
  buildCandidates,
  cancelRun,
  detectEngine,
  killRun,
  probeEnv,
  probeGpu,
  resetEngineDetection,
  sendControl,
  sendInfer,
  spawnExport,
  spawnInstall,
  spawnNew,
  spawnServe,
  spawnTrain,
  subscribeMlEvents,
  type ExitPayload,
  type InstallFlavor,
  type MlEnvInfo,
  type MlTemplate,
  type ProtoPayload,
  type StderrPayload,
} from "./lib/engine-bridge";
import {
  collectSamples,
  latestArtifact,
  latestConfusionMatrix,
  parseProtocolLines,
  parseServeLine,
  type ArtifactRef,
  type MetricStats,
  type MlSample,
  type RunSummary,
  type ServeEvent,
  type ServeMeta,
} from "./lib/protocol";
import { appendPoint, createSeriesMap, type Series } from "./lib/series";
import { readRunMeta, writeRunMeta, type RunMeta } from "./lib/notes";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
};

export type EngineStatus = "idle" | "detecting" | "ready" | "missing";

export type ActiveRunStatus =
  | "starting"
  | "running"
  | "cancelling"
  | "ok"
  | "cancelled"
  | "error";

export type ActiveRun = {
  sid: number;
  projectDir: string;
  runId: string | null;
  totalEpochs: number | null;
  epoch: number;
  status: ActiveRunStatus;
  startedAtMs: number;
  /** "cpu" / "cuda" / "cuda:0" — from run.started, once known. */
  device: string | null;
  /** Pause requested (engine pauses at the next epoch boundary). */
  paused?: boolean;
};

export type MlProject = {
  /** Absolute-ish path Nexis uses for fs/spawn calls. */
  dir: string;
  /** Short display name (directory basename). */
  name: string;
};

export type HistoricalRun = {
  id: string;
  dir: string;
  status: string;
  metrics?: Record<string, MetricStats>;
  lastEpoch?: number | null;
  totalEpochs?: number | null;
  finishedAt?: string;
  /** Per-run metadata from notes.json. */
  note?: string;
  tags?: string[];
  pinned?: boolean;
};

/** A historical run selected for overlay comparison. */
export type CompareRun = {
  id: string;
  dir: string;
  color: string;
  /** Metric names present in this run (for the chart union). */
  metrics: string[];
};

export type ServeStatus = "starting" | "ready" | "error" | "stopped";

/** A single prediction from the playground. */
export type PlaygroundResult =
  | { kind: "text"; input: string; output: string; continuation: string }
  | { kind: "tabular"; label?: string; probs?: Record<string, number>; value?: number };

/** Live inference session backing the playground (one `nexis-ml serve`). */
export type ServeSession = {
  sid: number;
  projectDir: string;
  runId: string;
  status: ServeStatus;
  /** "textgen" | "tabular", from the ready event. */
  template: string | null;
  device: string | null;
  meta: ServeMeta | null;
  /** A request is in flight (awaiting the next prediction/error). */
  busy: boolean;
  error: string | null;
  result: PlaygroundResult | null;
};

function toPlaygroundResult(
  ev: Extract<ServeEvent, { ev: "prediction" }>,
): PlaygroundResult {
  const out = ev.output;
  if (typeof out === "string") {
    return {
      kind: "text",
      input: String(ev.input ?? ""),
      output: out,
      continuation: typeof ev.continuation === "string" ? ev.continuation : out,
    };
  }
  if (out && typeof out === "object") {
    const o = out as { label?: unknown; probs?: unknown; value?: unknown };
    return {
      kind: "tabular",
      label: typeof o.label === "string" ? o.label : undefined,
      probs:
        o.probs && typeof o.probs === "object"
          ? (o.probs as Record<string, number>)
          : undefined,
      value: typeof o.value === "number" ? o.value : undefined,
    };
  }
  return { kind: "text", input: String(ev.input ?? ""), output: String(out ?? ""), continuation: "" };
}

/** Does this proto batch belong to the serve session (incl. the initial
 *  ready batch arriving before spawnServe's sid is stamped)? */
function serveOwns(payload: ProtoPayload, serve: ServeSession | null): boolean {
  if (!serve) return false;
  if (payload.sid === serve.sid) return true;
  if (serve.sid === -1) return parseServeLine(payload.lines[0] ?? "")?.ev === "ready";
  return false;
}

const MAX_LOG_LINES = 200;
const MAX_RUNS_LISTED = 50;
/** Keep only the most recent generated-text snapshots in memory. */
const MAX_SAMPLES = 12;

// ── Module-level series buffers (deliberately outside Zustand) ────────────────

let seriesMap = createSeriesMap();

export function getSeriesMap(): Map<string, Series> {
  return seriesMap;
}

function resetSeries(): void {
  seriesMap = createSeriesMap();
}

// Comparison buffers: runId → (metric name → series). Kept outside Zustand
// for the same reason as seriesMap (pitfall #14); CompareChart reads it
// imperatively keyed on the `seriesTick` counter.
let compareData = new Map<string, Map<string, Series>>();

export function getCompareData(): Map<string, Map<string, Series>> {
  return compareData;
}

function resetCompareData(): void {
  compareData = new Map();
}

/** Distinct line colors for compared runs (canvas can't read CSS vars,
 *  so these are fixed hex that read on both light and dark). */
const COMPARE_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
];
const MAX_COMPARE = COMPARE_COLORS.length;

// ── Store ─────────────────────────────────────────────────────────────────────

type MlStore = {
  engineStatus: EngineStatus;
  engineExe: string | null;
  engineVersion: string | null;
  engineError: string | null;
  /** Python to install the engine into, when one was detected. */
  installPython: string | null;
  installing: boolean;
  installSid: number | null;
  installRoot: string | null;
  /** Remaining pip steps (GPU installs run cuda-torch, then default). */
  installQueue: InstallFlavor[];
  /** What the installed engine can do (torch / CUDA), once probed. */
  envInfo: MlEnvInfo | null;
  /** NVIDIA GPU reported by the driver, engine not required. */
  hostGpu: string | null;

  projects: MlProject[];
  selectedProject: string | null; // dir
  pendingCreate: {
    sid: number;
    workspaceRoot: string;
    dir: string;
    autoTrain: boolean;
  } | null;

  activeRun: ActiveRun | null;
  /** Summary from the last run.finished event (best/final metrics). */
  lastSummary: RunSummary | null;
  /** Bumped once per applied event batch; charts subscribe to this. */
  seriesTick: number;
  /** Which run the series buffers currently hold. */
  chartSource: { kind: "live" } | { kind: "historical"; runId: string } | null;
  lastValues: Record<string, number>;
  /** Generated-text snapshots from `sample` events (the textgen payoff). */
  samples: MlSample[];
  /** Latest confusion-matrix artifact (path + epoch); the panel reads
   *  and renders it. Path is rebuilt from the run dir so it survives a
   *  moved project, like the metrics.jsonl reads do. */
  cmArtifact: ArtifactRef | null;
  /** Latest image-grid (sample-prediction) artifact for the image template. */
  imageArtifact: ArtifactRef | null;
  logs: string[];

  runs: HistoricalRun[];
  runsLoading: boolean;

  /** Inference playground session, or null when closed. */
  serve: ServeSession | null;

  /** Historical runs selected for overlay comparison. */
  compareRuns: CompareRun[];

  /** In-flight `nexis-ml export` (one at a time); its report path. */
  pendingExport: { sid: number; reportPath: string } | null;

  detect: (workspaceRoot: string | null) => Promise<void>;
  redetect: (workspaceRoot: string | null) => Promise<void>;
  installEngine: (workspaceRoot: string | null, useGpu: boolean) => Promise<void>;
  /** Swap the engine's CPU torch for the CUDA build. */
  upgradeToGpu: (workspaceRoot: string | null) => Promise<void>;
  refreshProjects: (workspaceRoot: string) => Promise<void>;
  selectProject: (dir: string) => void;
  createProject: (
    workspaceRoot: string,
    template: MlTemplate,
    name: string,
    autoTrain: boolean,
  ) => Promise<void>;
  startTrain: (projectDir: string) => Promise<void>;
  cancelActive: () => Promise<void>;
  pauseActive: () => Promise<void>;
  resumeActive: () => Promise<void>;
  refreshRuns: (projectDir: string) => Promise<void>;
  loadHistoricalRun: (run: HistoricalRun) => Promise<void>;

  startServe: (projectDir: string, runId: string) => Promise<void>;
  stopServe: () => Promise<void>;
  runInference: (request: unknown) => Promise<void>;

  toggleCompare: (run: HistoricalRun) => Promise<void>;
  clearCompare: () => void;

  setRunMeta: (run: HistoricalRun, patch: Partial<RunMeta>) => Promise<void>;
  exportReport: (projectDir: string, runId: string) => Promise<void>;

  _startNextInstall: () => Promise<void>;
  _applyProto: (payload: ProtoPayload) => void;
  _applyServeProto: (payload: ProtoPayload) => void;
  _applyStderr: (payload: StderrPayload) => void;
  _applyExit: (payload: ExitPayload) => void;
};

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Pinned runs first; order is otherwise preserved (the input is already
 *  newest-first), relying on Array.prototype.sort being stable. */
function sortRuns(runs: HistoricalRun[]): HistoricalRun[] {
  // Boolean-coerce: a missing `pinned` must read as 0, not NaN (which
  // would make the comparator inconsistent and leave the list unsorted).
  return runs.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

/** Subdirectories that can't plausibly be ML projects. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "target", "coverage"]);

async function hasTrainPy(dir: string): Promise<boolean> {
  try {
    await invoke("fs_stat", {
      path: `${dir}/train.py`,
      workspace: currentWorkspaceEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

function pushLog(logs: string[], line: string): string[] {
  const next = logs.length >= MAX_LOG_LINES ? logs.slice(-MAX_LOG_LINES + 1) : logs.slice();
  next.push(line);
  return next;
}

export const useMlStore = create<MlStore>((set, get) => ({
  engineStatus: "idle",
  engineExe: null,
  engineVersion: null,
  engineError: null,
  installPython: null,
  installing: false,
  installSid: null,
  installRoot: null,
  installQueue: [],
  envInfo: null,
  hostGpu: null,

  projects: [],
  selectedProject: null,
  pendingCreate: null,

  activeRun: null,
  lastSummary: null,
  seriesTick: 0,
  chartSource: null,
  lastValues: {},
  samples: [],
  cmArtifact: null,
  imageArtifact: null,
  logs: [],

  runs: [],
  runsLoading: false,

  serve: null,
  compareRuns: [],
  pendingExport: null,

  async detect(workspaceRoot) {
    if (get().engineStatus === "detecting") return;
    set({ engineStatus: "detecting", engineError: null });
    // Driver-level GPU check, independent of python/torch (cheap).
    void probeGpu()
      .then((name) => set({ hostGpu: name }))
      .catch(() => {});
    let envs: PythonEnv[] = [];
    if (workspaceRoot) {
      try {
        envs = await invoke<PythonEnv[]>("py_detect_envs", { workspaceRoot });
      } catch {
        // no python detection → still try PATH
      }
    }
    // Remember a python we could install the engine into (prefer an
    // isolated env over the system interpreter).
    const installTarget =
      envs.find((e) => e.kind === "venv" || e.kind === "conda") ?? envs[0];
    set({ installPython: installTarget?.python_path ?? null });
    try {
      const found = await detectEngine(buildCandidates(envs, workspaceRoot));
      set({
        engineStatus: "ready",
        engineExe: found.exe,
        engineVersion: found.version,
      });
      // Capability probe (torch/CUDA) after the UI unblocks — importing
      // torch inside `nexis-ml env` takes a few seconds.
      void probeEnv(found.exe)
        .then((env) => set({ envInfo: env }))
        .catch(() => set({ envInfo: null }));
    } catch (err) {
      set({
        engineStatus: "missing",
        engineExe: null,
        engineVersion: null,
        engineError: String(err),
        envInfo: null,
      });
    }
  },

  async redetect(workspaceRoot) {
    resetEngineDetection();
    set({ engineStatus: "idle" });
    await get().detect(workspaceRoot);
  },

  async installEngine(workspaceRoot, useGpu) {
    const { installPython, installing } = get();
    if (!installPython || installing) return;
    // GPU installs grab the CUDA torch build first, then the engine —
    // pip then sees torch as already satisfied.
    const queue: InstallFlavor[] = useGpu ? ["cuda-torch", "default"] : ["default"];
    set({ installing: true, installQueue: queue, installRoot: workspaceRoot });
    await get()._startNextInstall();
  },

  async upgradeToGpu(workspaceRoot) {
    const { installPython, installing } = get();
    if (!installPython || installing) return;
    set({
      installing: true,
      installQueue: ["cuda-torch"],
      installRoot: workspaceRoot,
    });
    await get()._startNextInstall();
  },

  async _startNextInstall() {
    const { installPython, installQueue } = get();
    const flavor = installQueue[0];
    if (!installPython || !flavor) return;
    const label =
      flavor === "cuda-torch"
        ? "$ pip install torch (CUDA build, ~3 GB — this is the big one)"
        : "$ pip install --upgrade nexis-ml[torch]";
    set((s) => ({
      installQueue: s.installQueue.slice(1),
      logs: pushLog(s.logs, label),
    }));
    try {
      const sid = await spawnInstall(installPython, flavor);
      set({ installSid: sid });
    } catch (err) {
      set((s) => ({
        installing: false,
        installSid: null,
        installQueue: [],
        logs: pushLog(s.logs, `install failed to start: ${String(err)}`),
      }));
    }
  },

  async refreshProjects(workspaceRoot) {
    const found: MlProject[] = [];
    if (await hasTrainPy(workspaceRoot)) {
      found.push({ dir: workspaceRoot, name: basename(workspaceRoot) });
    }
    try {
      const entries = await invoke<DirEntry[]>("fs_read_dir", {
        path: workspaceRoot,
        showHidden: false,
        workspace: currentWorkspaceEnv(),
      });
      const candidates = entries
        .filter(
          (e) =>
            e.kind === "dir" && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name),
        )
        .slice(0, 40);
      const checks = await Promise.all(
        candidates.map(async (e) => ({
          entry: e,
          ok: await hasTrainPy(`${workspaceRoot}/${e.name}`),
        })),
      );
      for (const c of checks) {
        if (c.ok) {
          found.push({ dir: `${workspaceRoot}/${c.entry.name}`, name: c.entry.name });
        }
      }
    } catch {
      // unreadable workspace root — keep whatever we found
    }
    const prev = get().selectedProject;
    const selected =
      (prev && found.some((p) => p.dir === prev) ? prev : null) ??
      found[0]?.dir ??
      null;
    set({ projects: found, selectedProject: selected });
    if (selected) void get().refreshRuns(selected);
    else set({ runs: [] });
  },

  selectProject(dir) {
    void get().stopServe(); // playground was tied to the old run
    get().clearCompare(); // run ids belong to the old project
    set({ selectedProject: dir });
    void get().refreshRuns(dir);
  },

  async createProject(workspaceRoot, template, name, autoTrain) {
    const { engineExe, pendingCreate } = get();
    if (!engineExe || pendingCreate) return;
    const clean = name.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!clean) {
      set((s) => ({ logs: pushLog(s.logs, "project name can't be empty") }));
      return;
    }
    set((s) => ({
      logs: pushLog(s.logs, `$ nexis-ml new ${template} ${clean}  (${workspaceRoot})`),
    }));
    try {
      const sid = await spawnNew(engineExe, workspaceRoot, template, clean);
      set({
        pendingCreate: {
          sid,
          workspaceRoot,
          dir: `${workspaceRoot}/${clean}`,
          autoTrain,
        },
      });
    } catch (err) {
      set((s) => ({
        logs: pushLog(s.logs, `create failed: ${String(err)}`),
      }));
    }
  },

  async startTrain(projectDir) {
    const { engineExe, activeRun } = get();
    if (!engineExe) return;
    if (activeRun && ["starting", "running", "cancelling"].includes(activeRun.status)) {
      return; // one run at a time in phase 1
    }
    void get().stopServe(); // a fresh run supersedes any open playground
    resetSeries();
    set((s) => ({
      activeRun: {
        sid: -1,
        projectDir,
        runId: null,
        totalEpochs: null,
        epoch: 0,
        status: "starting",
        startedAtMs: Date.now(),
        device: null,
      },
      lastSummary: null,
      chartSource: { kind: "live" },
      lastValues: {},
      samples: [],
      cmArtifact: null,
      imageArtifact: null,
      seriesTick: s.seriesTick + 1,
      logs: pushLog(s.logs, `$ nexis-ml train  (${projectDir})`),
    }));
    try {
      const sid = await spawnTrain(engineExe, projectDir);
      set((s) =>
        s.activeRun ? { activeRun: { ...s.activeRun, sid } } : {},
      );
    } catch (err) {
      set((s) => ({
        activeRun: s.activeRun ? { ...s.activeRun, status: "error" } : null,
        logs: pushLog(s.logs, `spawn failed: ${String(err)}`),
      }));
    }
  },

  async cancelActive() {
    const run = get().activeRun;
    if (!run || run.sid < 0) return;
    if (run.status === "cancelling") {
      // Second click: stop being polite.
      try {
        await killRun(run.sid);
      } catch {
        // already gone
      }
      return;
    }
    set({ activeRun: { ...run, status: "cancelling" } });
    try {
      await cancelRun(run.sid);
    } catch (err) {
      set((s) => ({ logs: pushLog(s.logs, `cancel failed: ${String(err)}`) }));
    }
  },

  async pauseActive() {
    const run = get().activeRun;
    if (!run || run.sid < 0 || run.status !== "running" || run.paused) return;
    set({ activeRun: { ...run, paused: true } }); // optimistic; engine pauses at next epoch
    try {
      await sendControl(run.sid, "pause");
    } catch (err) {
      set((s) => ({
        activeRun: s.activeRun ? { ...s.activeRun, paused: false } : null,
        logs: pushLog(s.logs, `pause failed: ${String(err)}`),
      }));
    }
  },

  async resumeActive() {
    const run = get().activeRun;
    if (!run || run.sid < 0 || !run.paused) return;
    set({ activeRun: { ...run, paused: false } });
    try {
      await sendControl(run.sid, "resume");
    } catch (err) {
      set((s) => ({ logs: pushLog(s.logs, `resume failed: ${String(err)}`) }));
    }
  },

  async refreshRuns(projectDir) {
    const runsDir = `${projectDir}/.nexis-ml/runs`;
    set({ runsLoading: true });
    // Concurrent refreshes can race (e.g. create-project triggers one
    // via refreshProjects and another via selectProject) — only the
    // load for the currently selected project may write the list.
    const stillCurrent = () => get().selectedProject === projectDir;
    try {
      const entries = await invoke<DirEntry[]>("fs_read_dir", {
        path: runsDir,
        showHidden: true,
        workspace: currentWorkspaceEnv(),
      });
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
          // still be annotated/pinned), so read it either way.
          const meta = await readRunMeta(dir);
          const withMeta = { note: meta.note, tags: meta.tags, pinned: meta.pinned };
          try {
            const res = await invoke<ReadResult>("fs_read_file", {
              path: `${dir}/summary.json`,
              workspace: currentWorkspaceEnv(),
            });
            if (res.kind === "text") {
              const summary = JSON.parse(res.content) as RunSummary;
              return {
                ...base,
                ...withMeta,
                status: summary.status ?? "unknown",
                metrics: summary.metrics,
                lastEpoch: summary.lastEpoch,
                totalEpochs: summary.totalEpochs,
                finishedAt: summary.finishedAt,
              };
            }
          } catch {
            // no summary → run still in progress or crashed; keep "unknown"
          }
          return { ...base, ...withMeta };
        }),
      );
      if (stillCurrent()) set({ runs: sortRuns(runs), runsLoading: false });
      else set({ runsLoading: false });
    } catch {
      // .nexis-ml/runs doesn't exist yet — that's a fresh project, not an error
      if (stillCurrent()) set({ runs: [], runsLoading: false });
      else set({ runsLoading: false });
    }
  },

  async loadHistoricalRun(run) {
    const active = get().activeRun;
    if (active && ["starting", "running", "cancelling"].includes(active.status)) {
      return; // don't clobber a live chart
    }
    void get().stopServe(); // viewing a different run closes the playground
    try {
      const res = await invoke<ReadResult>("fs_read_file", {
        path: `${run.dir}/metrics.jsonl`,
        workspace: currentWorkspaceEnv(),
      });
      if (res.kind !== "text") {
        set((s) => ({
          logs: pushLog(
            s.logs,
            res.kind === "toolarge"
              ? `run ${run.id} is too large to load (${res.size} bytes)`
              : `run ${run.id}: metrics.jsonl unreadable`,
          ),
        }));
        return;
      }
      resetSeries();
      const events = parseProtocolLines(res.content.split("\n"));
      const lastValues: Record<string, number> = {};
      for (const ev of events) {
        if (ev.ev === "metric") {
          appendPoint(seriesMap, ev.name, ev.step, ev.value);
          lastValues[ev.name] = ev.value;
        }
      }
      const cmRef = latestConfusionMatrix(events);
      const imgRef = latestArtifact(events, "image-grid");
      set((s) => ({
        chartSource: { kind: "historical", runId: run.id },
        lastValues,
        samples: collectSamples(events, MAX_SAMPLES),
        cmArtifact: cmRef
          ? { path: `${run.dir}/artifacts/${basename(cmRef.path)}`, epoch: cmRef.epoch }
          : null,
        imageArtifact: imgRef
          ? { path: `${run.dir}/artifacts/${basename(imgRef.path)}`, epoch: imgRef.epoch }
          : null,
        seriesTick: s.seriesTick + 1,
      }));
    } catch (err) {
      set((s) => ({
        logs: pushLog(s.logs, `failed to load ${run.id}: ${String(err)}`),
      }));
    }
  },

  async startServe(projectDir, runId) {
    const { engineExe } = get();
    if (!engineExe) return;
    // One playground at a time — drop any model already loaded.
    if (get().serve) await get().stopServe();
    set({
      serve: {
        sid: -1,
        projectDir,
        runId,
        status: "starting",
        template: null,
        device: null,
        meta: null,
        busy: false,
        error: null,
        result: null,
      },
    });
    try {
      const sid = await spawnServe(engineExe, projectDir, runId);
      set((s) =>
        s.serve && s.serve.sid === -1 ? { serve: { ...s.serve, sid } } : {},
      );
    } catch (err) {
      set((s) => ({
        serve: s.serve
          ? { ...s.serve, status: "error", error: String(err) }
          : null,
      }));
    }
  },

  async stopServe() {
    const serve = get().serve;
    if (!serve) return;
    set({ serve: null });
    if (serve.sid >= 0) {
      try {
        await killRun(serve.sid); // serve has no checkpoint to save
      } catch {
        // already gone
      }
    }
  },

  async runInference(request) {
    const serve = get().serve;
    if (!serve || serve.sid < 0 || serve.status !== "ready" || serve.busy) return;
    set({ serve: { ...serve, busy: true, error: null } });
    try {
      await sendInfer(serve.sid, request);
    } catch (err) {
      set((s) => ({
        serve: s.serve ? { ...s.serve, busy: false, error: String(err) } : null,
      }));
    }
  },

  async toggleCompare(run) {
    const existing = get().compareRuns;
    // Already comparing this run → drop it.
    if (existing.some((r) => r.id === run.id)) {
      compareData.delete(run.id);
      set((s) => ({
        compareRuns: s.compareRuns.filter((r) => r.id !== run.id),
        seriesTick: s.seriesTick + 1,
      }));
      return;
    }
    if (existing.length >= MAX_COMPARE) {
      set((s) => ({
        logs: pushLog(s.logs, `compare up to ${MAX_COMPARE} runs at once`),
      }));
      return;
    }
    try {
      const res = await invoke<ReadResult>("fs_read_file", {
        path: `${run.dir}/metrics.jsonl`,
        workspace: currentWorkspaceEnv(),
      });
      if (res.kind !== "text") return;
      const series = createSeriesMap();
      const metricNames = new Set<string>();
      for (const ev of parseProtocolLines(res.content.split("\n"))) {
        if (ev.ev === "metric") {
          appendPoint(series, ev.name, ev.step, ev.value);
          metricNames.add(ev.name);
        }
      }
      compareData.set(run.id, series);
      // Pick the first unused palette color so swatches stay distinct
      // even after a middle run is removed.
      const used = new Set(get().compareRuns.map((r) => r.color));
      const color =
        COMPARE_COLORS.find((c) => !used.has(c)) ??
        COMPARE_COLORS[get().compareRuns.length % COMPARE_COLORS.length];
      set((s) => ({
        compareRuns: [
          ...s.compareRuns,
          { id: run.id, dir: run.dir, color, metrics: [...metricNames] },
        ],
        seriesTick: s.seriesTick + 1,
      }));
    } catch (err) {
      set((s) => ({
        logs: pushLog(s.logs, `couldn't load ${run.id} for compare: ${String(err)}`),
      }));
    }
  },

  clearCompare() {
    resetCompareData();
    set((s) => ({ compareRuns: [], seriesTick: s.seriesTick + 1 }));
  },

  async setRunMeta(run, patch) {
    const next: RunMeta = {
      note: run.note ?? "",
      tags: run.tags ?? [],
      pinned: run.pinned ?? false,
      ...patch,
    };
    try {
      await writeRunMeta(run.dir, next);
      set((s) => ({
        runs: sortRuns(
          s.runs.map((r) => (r.id === run.id ? { ...r, ...next } : r)),
        ),
      }));
    } catch (err) {
      set((s) => ({
        logs: pushLog(s.logs, `couldn't save notes for ${run.id}: ${String(err)}`),
      }));
    }
  },

  async exportReport(projectDir, runId) {
    const { engineExe, pendingExport } = get();
    if (!engineExe || pendingExport) return;
    const reportPath = `${projectDir}/.nexis-ml/runs/${runId}/report.html`;
    set((s) => ({ logs: pushLog(s.logs, `$ nexis-ml export --run ${runId}`) }));
    try {
      const sid = await spawnExport(engineExe, projectDir, runId);
      set({ pendingExport: { sid, reportPath } });
    } catch (err) {
      set((s) => ({ logs: pushLog(s.logs, `export failed: ${String(err)}`) }));
    }
  },

  _applyServeProto(payload) {
    let serve = get().serve;
    if (!serve) return;
    if (payload.sid !== serve.sid) {
      if (serve.sid === -1 && serveOwns(payload, serve)) {
        serve = { ...serve, sid: payload.sid };
      } else {
        return;
      }
    }
    let { status, template, device, meta, busy, error, result } = serve;
    for (const line of payload.lines) {
      const ev = parseServeLine(line);
      if (!ev) continue;
      if (ev.ev === "ready") {
        status = "ready";
        template = ev.template ?? null;
        device = ev.device ?? null;
        meta = ev.meta ?? null;
      } else if (ev.ev === "prediction") {
        busy = false;
        error = null;
        result = toPlaygroundResult(ev);
      } else if (ev.ev === "error") {
        busy = false;
        error = ev.msg;
      }
    }
    set({ serve: { ...serve, status, template, device, meta, busy, error, result } });
  },

  _applyProto(payload) {
    if (serveOwns(payload, get().serve)) {
      get()._applyServeProto(payload);
      return;
    }
    let run = get().activeRun;
    if (!run) return;
    if (payload.sid !== run.sid) {
      // Spawn race: ml_spawn's events can land before its invoke
      // promise resolves and stamps the sid. While we're still waiting
      // (sid -1), adopt a batch that opens with a run.started — only
      // one spawn can be in flight, so it's unambiguously ours.
      const adoptable =
        run.sid === -1 &&
        payload.sid !== get().installSid &&
        payload.sid !== get().pendingCreate?.sid &&
        parseProtocolLines(payload.lines.slice(0, 1))[0]?.ev === "run.started";
      if (!adoptable) return;
      run = { ...run, sid: payload.sid };
    }
    const events = parseProtocolLines(payload.lines);
    if (events.length === 0) return;

    let next: ActiveRun = run;
    let logs = get().logs;
    const lastValues = { ...get().lastValues };
    let finishedProject: string | null = null;

    for (const ev of events) {
      switch (ev.ev) {
        case "run.started":
          next = {
            ...next,
            runId: ev.run,
            totalEpochs: ev.totalEpochs ?? null,
            device: ev.device ?? null,
            status: "running",
          };
          break;
        case "metric":
          appendPoint(seriesMap, ev.name, ev.step, ev.value);
          lastValues[ev.name] = ev.value;
          break;
        case "epoch":
          next = { ...next, epoch: ev.epoch };
          break;
        case "log":
          logs = pushLog(logs, ev.msg);
          break;
        case "sample":
          // Folded into the samples buffer after the loop (it needs the
          // epoch resolved across the whole batch) — see collectSamples.
          break;
        case "artifact":
          // Rendered kinds are folded in after the loop; anything without
          // a viewer yet still surfaces in the log.
          if (ev.kind !== "confusion-matrix" && ev.kind !== "image-grid") {
            logs = pushLog(logs, `artifact (${ev.kind}): ${ev.path}`);
          }
          break;
        case "run.finished": {
          const status = ev.status === "ok" || ev.status === "cancelled" ? ev.status : "error";
          next = { ...next, status };
          finishedProject = run.projectDir;
          if (ev.summary) set({ lastSummary: ev.summary });
          break;
        }
      }
    }

    // Only rebuild the samples array when this batch actually carried a
    // sample — otherwise a new reference every ~30 Hz batch would churn
    // the samples view for nothing.
    const samples = events.some((e) => e.ev === "sample")
      ? collectSamples(events, MAX_SAMPLES, get().samples, run.epoch)
      : null;

    // Rebuild the run-dir-relative path so it reads back even if the
    // project later moves (the engine's artifact path is absolute).
    const runArtifactDir = next.runId
      ? `${run.projectDir}/.nexis-ml/runs/${next.runId}/artifacts`
      : null;
    const cmRef = latestConfusionMatrix(events, run.epoch);
    const cmArtifact =
      cmRef && runArtifactDir
        ? { path: `${runArtifactDir}/${basename(cmRef.path)}`, epoch: cmRef.epoch }
        : null;
    const imgRef = latestArtifact(events, "image-grid", run.epoch);
    const imageArtifact =
      imgRef && runArtifactDir
        ? { path: `${runArtifactDir}/${basename(imgRef.path)}`, epoch: imgRef.epoch }
        : null;

    set((s) => ({
      activeRun: next,
      lastValues,
      logs,
      ...(samples ? { samples } : {}),
      ...(cmArtifact ? { cmArtifact } : {}),
      ...(imageArtifact ? { imageArtifact } : {}),
      seriesTick: s.seriesTick + 1,
    }));
    if (finishedProject) {
      void get().refreshRuns(finishedProject);
    }
  },

  _applyStderr(payload) {
    const { activeRun, installSid, pendingCreate, serve, pendingExport } = get();
    const known =
      payload.sid === activeRun?.sid ||
      payload.sid === installSid ||
      payload.sid === pendingCreate?.sid ||
      payload.sid === serve?.sid ||
      payload.sid === pendingExport?.sid;
    if (!known) return;
    set((s) => ({ logs: pushLog(s.logs, payload.line) }));
  },

  _applyExit(payload) {
    const { activeRun, installSid, pendingCreate, serve, pendingExport } = get();

    // export finished → reveal the report file (or report failure)
    if (pendingExport && payload.sid === pendingExport.sid) {
      const { reportPath } = pendingExport;
      set({ pendingExport: null });
      if (payload.code === 0) {
        set((s) => ({ logs: pushLog(s.logs, `report written: ${reportPath}`) }));
        void revealItemInDir(reportPath).catch(() => {});
      } else {
        set((s) => ({
          logs: pushLog(s.logs, `export failed (exit ${payload.code ?? "?"})`),
        }));
      }
      return;
    }

    // serve session ended (killed by us, or the engine died)
    if (serve && payload.sid === serve.sid) {
      set({
        serve: {
          ...serve,
          status: serve.status === "ready" ? "stopped" : "error",
          busy: false,
          error:
            serve.status === "ready"
              ? serve.error
              : (serve.error ?? "the inference engine stopped"),
        },
      });
      return;
    }

    // pip install step finished → next step, or re-probe for the engine
    if (payload.sid === installSid) {
      const ok = payload.code === 0;
      const root = get().installRoot;
      if (ok && get().installQueue.length > 0) {
        set({ installSid: null });
        void get()._startNextInstall();
        return;
      }
      set((s) => ({
        installing: false,
        installSid: null,
        installRoot: null,
        installQueue: [],
        logs: pushLog(
          s.logs,
          ok
            ? "install finished — checking the engine…"
            : `install failed (exit ${payload.code ?? "?"})`,
        ),
      }));
      if (ok) void get().redetect(root);
      return;
    }

    // project scaffold finished → select it (and maybe start training)
    if (payload.sid === pendingCreate?.sid) {
      const { workspaceRoot, dir, autoTrain } = pendingCreate;
      set({ pendingCreate: null });
      if (payload.code === 0) {
        void get()
          .refreshProjects(workspaceRoot)
          .then(() => {
            get().selectProject(dir);
            if (autoTrain) void get().startTrain(dir);
          });
      } else {
        set((s) => ({
          logs: pushLog(s.logs, `create failed (exit ${payload.code ?? "?"})`),
        }));
      }
      return;
    }

    if (!activeRun || payload.sid !== activeRun.sid) return;
    if (["starting", "running", "cancelling"].includes(activeRun.status)) {
      // Exit without a run.finished event — the engine died on us.
      set((s) => ({
        activeRun: { ...activeRun, status: "error" },
        logs: pushLog(
          s.logs,
          `engine exited unexpectedly (code ${payload.code ?? "?"})`,
        ),
      }));
      void get().refreshRuns(activeRun.projectDir);
    }
  },
}));

/**
 * Wire the Tauri event stream into the store. Called once from the
 * plugin's activate(); returns a dispose function.
 */
export function initMlSubscriptions(): () => void {
  const s = useMlStore.getState();
  return subscribeMlEvents({
    onProto: s._applyProto,
    onStderr: s._applyStderr,
    onExit: s._applyExit,
  });
}
