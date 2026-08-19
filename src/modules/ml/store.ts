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
import { basename } from "@/lib/path";
import {
  currentWorkspaceEnv,
  currentWorkspaceScopeKey,
} from "@/modules/workspace";
import type { PythonEnv } from "@/modules/python/usePythonEnv";
import {
  buildCandidates,
  cancelRun,
  detectEngine,
  downloadEngine,
  engineInstallPin,
  engineKindFromEnv,
  engineSupportsTemplate,
  installLocalEngine,
  killRun,
  managedEngineCandidate,
  managedEngineStatus,
  probeEnv,
  probeGpu,
  resetEngineDetection,
  sendControl,
  sendInfer,
  spawnExport,
  spawnExportOnnx,
  spawnInstall,
  spawnNew,
  spawnServe,
  spawnTrain,
  subscribeMlEvents,
  uninstallEngine,
  type EngineDetectResult,
  type EngineKind,
  type EnginePin,
  type ExitPayload,
  type InstallFlavor,
  type ManagedEngineStatus,
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
import { readTextFile, type ReadResult } from "./lib/fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

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

/** Rebuild an artifact ref's path relative to its run's artifacts dir, so
 *  it reads back even if the project later moves (the engine emits an
 *  absolute path). Shared by the live and historical-load paths. */
function rebindArtifact(
  ref: ArtifactRef | null,
  artifactsDir: string | null,
): ArtifactRef | null {
  return ref && artifactsDir
    ? { path: `${artifactsDir}/${basename(ref.path)}`, epoch: ref.epoch }
    : null;
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
const BUSY_RUN_STATES = ["starting", "running", "cancelling"];
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
  /** Workspace scope (`local` / `wsl:<distro>`) the engine facts below were
   *  answered by. A mismatch means they belong to a different machine and
   *  must be discarded, not reused — see `detect`. */
  engineScope: string | null;
  engineExe: string | null;
  engineVersion: string | null;
  engineError: string | null;
  /** Paths the last detection probed, in order. Shown in the setup card so
   *  "no engine found" is an actionable statement rather than an opaque one —
   *  the common cause is an engine installed somewhere the scan never looks. */
  engineCandidates: string[];
  /** Which engine is active. Gates Python-only features (textgen / `blank`
   *  templates, HTML report; the Playground is capability-gated via
   *  `envInfo.serve` since Rust engine v0.8) — null until the env probe
   *  tells us, which callers treat as "don't block". */
  engineKind: EngineKind | null;
  /** Python to install the engine into, when one was detected. */
  installPython: string | null;
  /** Version that interpreter reports, used to warn in the manual Python
   *  steps: PyTorch publishes no wheels at all for a CPython that is too new,
   *  and pip only says so after resolving. */
  installPythonVersion: string | null;
  installing: boolean;
  installSid: number | null;
  installRoot: string | null;
  /** Remaining pip steps (GPU installs run cuda-torch, then default). */
  installQueue: InstallFlavor[];
  /** The pip step currently running — used to fall back PyPI → GitHub. */
  installFlavor: InstallFlavor | null;
  /** Downloading the standalone Rust engine (no-Python path). */
  downloadingEngine: boolean;
  /** Deleting the managed engine binary. Separate from `downloadingEngine`
   *  so the Remove button can show progress instead of appearing inert. */
  uninstallingEngine: boolean;
  /** The compiled-in engine release pin (version/url/size/sha256), for the
   *  consent dialog. null = not fetched yet or no prebuilt for platform. */
  enginePin: EnginePin | null;
  /** Managed (downloaded) engine footprint, for the disk-usage readout and
   *  the uninstall row. null until first refreshed. */
  managedEngine: ManagedEngineStatus | null;
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
  /** Why the last "Create & train" didn't start — shown on the create card. */
  createError: string | null;

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
  /** Latest `weights` artifact (network-graph overlay — ML_SUITE.md contract;
   *  stays null until an engine version emits it). */
  weightsArtifact: ArtifactRef | null;
  logs: string[];

  runs: HistoricalRun[];
  runsLoading: boolean;

  /** Inference playground session, or null when closed. */
  serve: ServeSession | null;

  /** Historical runs selected for overlay comparison. */
  compareRuns: CompareRun[];

  /** In-flight `nexis-ml export --run` (one at a time); its report path. */
  pendingExport: { sid: number; reportPath: string } | null;
  /** In-flight `nexis-ml export --onnx` (Rust engine); its output path. */
  pendingOnnx: { sid: number; outPath: string; projectDir: string } | null;

  detect: (workspaceRoot: string | null) => Promise<void>;
  redetect: (workspaceRoot: string | null) => Promise<void>;
  /** Swap the engine's CPU torch for the CUDA build. The only pip path Nexis
   *  still drives itself: it acts on an environment the user already built
   *  and chose, rather than picking one for them (see PythonEngineSteps). */
  upgradeToGpu: (workspaceRoot: string | null) => Promise<void>;
  /** Download the standalone Rust engine (no Python needed). The caller
   *  must have shown the consent dialog first (EngineConsentDialog). */
  downloadStandaloneEngine: () => Promise<void>;
  /** Offline path: install the pinned engine from a local file. */
  installLocalCopy: (path: string) => Promise<void>;
  /** Remove the managed engine binary and re-detect (PATH/venv engines
   *  keep working). */
  uninstallManagedEngine: (workspaceRoot: string | null) => Promise<void>;
  /** Refresh enginePin + managedEngine (cheap; called from detect). */
  refreshEngineMeta: () => Promise<void>;
  /** Shared tail of both managed-install paths (download / local copy). */
  _finishManagedInstall: (
    pending: Promise<EngineDetectResult>,
    verb: "download" | "install",
  ) => Promise<void>;
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
  exportOnnx: (projectDir: string) => Promise<void>;

  _startNextInstall: () => Promise<void>;
  _applyProto: (payload: ProtoPayload) => void;
  _applyServeProto: (payload: ProtoPayload) => void;
  _applyStderr: (payload: StderrPayload) => void;
  _applyExit: (payload: ExitPayload) => void;
};

/** Pinned runs first; order is otherwise preserved (the input is already
 *  newest-first), relying on Array.prototype.sort being stable. */
function sortRuns(runs: HistoricalRun[]): HistoricalRun[] {
  // Boolean-coerce: a missing `pinned` must read as 0, not NaN (which
  // would make the comparator inconsistent and leave the list unsorted).
  return runs.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

/** Subdirectories that can't plausibly be ML projects. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "target", "coverage"]);

async function fileExists(path: string): Promise<boolean> {
  try {
    await invoke("fs_stat", { path, workspace: currentWorkspaceEnv() });
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

function pushLog(logs: string[], line: string): string[] {
  const next = logs.length >= MAX_LOG_LINES ? logs.slice(-MAX_LOG_LINES + 1) : logs.slice();
  next.push(line);
  return next;
}

export const useMlStore = create<MlStore>((set, get) => ({
  engineStatus: "idle",
  engineScope: null,
  engineCandidates: [],
  engineExe: null,
  engineVersion: null,
  engineError: null,
  engineKind: null,
  createError: null,
  installPython: null,
  installPythonVersion: null,
  installing: false,
  installSid: null,
  installRoot: null,
  installQueue: [],
  installFlavor: null,
  downloadingEngine: false,
  uninstallingEngine: false,
  enginePin: null,
  managedEngine: null,
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
  weightsArtifact: null,
  logs: [],

  runs: [],
  runsLoading: false,

  serve: null,
  compareRuns: [],
  pendingExport: null,
  pendingOnnx: null,

  async detect(workspaceRoot) {
    const scope = currentWorkspaceScopeKey();
    if (get().engineStatus === "detecting" && get().engineScope === scope) return;
    // Everything the panel knows about the engine is answered *by* an
    // environment: which binary, which torch build, which GPU, whether the
    // managed download applies. Switching Windows↔WSL therefore invalidates
    // all of it. Without this the panel kept the host's answers and reported
    // a ready Windows engine for a distro that has none.
    if (get().engineScope !== scope) {
      set({
        engineScope: scope,
        engineCandidates: [],
        installPythonVersion: null,
        engineExe: null,
        engineVersion: null,
        engineKind: null,
        engineError: null,
        envInfo: null,
        installPython: null,
        managedEngine: null,
      });
    }
    set({ engineStatus: "detecting", engineError: null });
    // Pin + managed-engine footprint for the setup card (cheap, local).
    void get().refreshEngineMeta();
    // Driver-level GPU check, independent of python/torch (cheap).
    void probeGpu()
      .then((name) => set({ hostGpu: name }))
      .catch(() => {});
    let envs: PythonEnv[] = [];
    if (workspaceRoot) {
      try {
        envs = await invoke<PythonEnv[]>("py_detect_envs", {
          workspaceRoot,
          workspace: currentWorkspaceEnv(),
        });
      } catch {
        // no python detection → still try PATH
      }
    }
    // Remember a python we could install the engine into (prefer an
    // isolated env over the system interpreter).
    const installTarget =
      envs.find((e) => e.kind === "venv" || e.kind === "conda") ?? envs[0];
    set({
      installPython: installTarget?.python_path ?? null,
      installPythonVersion: installTarget?.version ?? null,
    });
    try {
      // Candidates: Python envs + ancestor venvs + PATH, then the managed
      // standalone engine (the "no Python" fallback) last.
      const candidates = buildCandidates(envs, workspaceRoot);
      const managed = await managedEngineCandidate();
      if (managed) candidates.push(managed);
      set({ engineCandidates: candidates });
      const found = await detectEngine(candidates);
      set({
        engineStatus: "ready",
        engineExe: found.exe,
        engineVersion: found.version,
        // The managed binary is always the standalone Rust engine, so we
        // can gate its narrower feature set immediately; for anything else
        // we wait for the env probe rather than guessing.
        engineKind: managed && found.exe === managed ? "rust" : null,
      });
      // Capability probe (torch/CUDA + backend) after the UI unblocks —
      // importing torch inside `nexis-ml env` takes a few seconds.
      void probeEnv(found.exe)
        .then((env) =>
          set((s) => ({
            envInfo: env,
            engineKind: engineKindFromEnv(env) ?? s.engineKind,
          })),
        )
        .catch(() => set({ envInfo: null }));
    } catch (err) {
      set({
        engineStatus: "missing",
        engineExe: null,
        engineVersion: null,
        engineKind: null,
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

  async downloadStandaloneEngine() {
    if (get().downloadingEngine || get().installing) return;
    const pin = get().enginePin ?? (await engineInstallPin());
    if (!pin) {
      set({
        engineError: "No prebuilt standalone engine for this platform yet.",
      });
      return;
    }
    const mb = (pin.sizeBytes / (1024 * 1024)).toFixed(0);
    set((s) => ({
      downloadingEngine: true,
      engineError: null,
      logs: pushLog(
        s.logs,
        `downloading nexis-ml ${pin.version} (${mb} MB, sha256-verified)…`,
      ),
    }));
    await get()._finishManagedInstall(downloadEngine(), "download");
  },

  async installLocalCopy(path) {
    if (get().downloadingEngine || get().installing) return;
    const trimmed = path.trim();
    if (!trimmed) return;
    set((s) => ({
      downloadingEngine: true,
      engineError: null,
      logs: pushLog(s.logs, `verifying local engine copy: ${trimmed}`),
    }));
    await get()._finishManagedInstall(installLocalEngine(trimmed), "install");
  },

  async _finishManagedInstall(pending, verb) {
    try {
      const res = await pending;
      set((s) => ({
        downloadingEngine: false,
        engineStatus: "ready",
        engineExe: res.exe,
        engineVersion: res.version,
        // The managed standalone binary is always the Rust engine.
        engineKind: "rust",
        engineError: null,
        logs: pushLog(s.logs, `standalone engine ready (${res.version})`),
      }));
      void get().refreshEngineMeta();
      void probeEnv(res.exe)
        .then((env) =>
          set((s) => ({
            envInfo: env,
            engineKind: engineKindFromEnv(env) ?? s.engineKind,
          })),
        )
        .catch(() => set({ envInfo: null }));
    } catch (err) {
      set((s) => ({
        downloadingEngine: false,
        engineError: `Engine ${verb} failed: ${String(err)}`,
        logs: pushLog(s.logs, `engine ${verb} failed: ${String(err)}`),
      }));
    }
  },

  async uninstallManagedEngine(workspaceRoot) {
    // The old guard returned silently while an install was running, on a
    // button that stayed enabled — a click that did nothing, showed nothing,
    // and logged nothing. Anything that stops the removal now says so.
    const { downloadingEngine, installing, uninstallingEngine } = get();
    if (uninstallingEngine) return;
    if (downloadingEngine || installing) {
      set({
        engineError:
          "Can't remove the engine while an install or download is running — wait for it to finish.",
      });
      return;
    }
    set({ uninstallingEngine: true, engineError: null });
    try {
      const freed = await uninstallEngine();
      const mb = (freed / (1024 * 1024)).toFixed(0);
      set((s) => ({
        logs: pushLog(s.logs, `managed engine removed (freed ${mb} MB)`),
      }));
    } catch (err) {
      set((s) => ({
        engineError: `Engine uninstall failed: ${String(err)}`,
        logs: pushLog(s.logs, `engine uninstall failed: ${String(err)}`),
      }));
      return;
    } finally {
      set({ uninstallingEngine: false });
    }
    await get().refreshEngineMeta();
    // The engine may still exist in a venv/PATH — let detection decide.
    await get().redetect(workspaceRoot);
  },

  async refreshEngineMeta() {
    // The pinned download and the managed binary are host-side facts. In a
    // WSL workspace they describe the wrong machine, so the setup card must
    // not offer the download and the settings row must not offer to remove
    // something the distro never had.
    if (currentWorkspaceEnv().kind !== "local") {
      set({ enginePin: null, managedEngine: null });
      return;
    }
    const [pin, managed] = await Promise.all([
      engineInstallPin(),
      managedEngineStatus(),
    ]);
    set({ enginePin: pin, managedEngine: managed });
  },

  async _startNextInstall() {
    const { installPython, installQueue } = get();
    const flavor = installQueue[0];
    if (!installPython || !flavor) return;
    const label =
      flavor === "cuda-torch"
        ? "$ pip install torch (CUDA build, ~3 GB — this is the big one)"
        : flavor === "git"
          ? "$ pip install nexis-ml[torch] from GitHub (PyPI fallback)"
          : "$ pip install --upgrade nexis-ml[torch]";
    set((s) => ({
      installQueue: s.installQueue.slice(1),
      installFlavor: flavor,
      logs: pushLog(s.logs, label),
    }));
    try {
      const sid = await spawnInstall(installPython, flavor);
      set({ installSid: sid });
    } catch (err) {
      set((s) => ({
        installing: false,
        installSid: null,
        installFlavor: null,
        installQueue: [],
        logs: pushLog(s.logs, `install failed to start: ${String(err)}`),
      }));
    }
  },

  async refreshProjects(workspaceRoot) {
    const found: MlProject[] = [];
    if (await isMlProject(workspaceRoot)) {
      found.push(await toProject(workspaceRoot, basename(workspaceRoot)));
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
    const { engineExe, engineKind, pendingCreate } = get();
    if (pendingCreate) return; // already creating one
    // Surface why nothing would happen, instead of silently returning.
    if (!engineExe) {
      set({ createError: "No engine is set up yet — install or download one above." });
      return;
    }
    // Belt-and-suspenders for the filtered card (the picker hides these on
    // the Rust engine): it can't scaffold textgen / blank — it's config-only.
    // Say so plainly instead of letting the engine fail with a cryptic
    // "exit 2" (it reports "unknown template '<x>' (supports: tabular, image)").
    if (!engineSupportsTemplate(template, engineKind)) {
      set({
        createError:
          "This template needs the Python engine — the standalone engine only does Spreadsheet and Image projects.",
      });
      return;
    }
    if (!workspaceRoot) {
      set({ createError: "Open a folder first — the project is created inside it." });
      return;
    }
    const clean = name.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!clean) {
      set({ createError: "Project name can't be empty." });
      return;
    }
    set((s) => ({
      createError: null,
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
        createError: `Couldn't start the engine: ${String(err)}`,
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
      weightsArtifact: null,
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
      const artifactsDir = `${run.dir}/artifacts`;
      set((s) => ({
        chartSource: { kind: "historical", runId: run.id },
        lastValues,
        samples: collectSamples(events, MAX_SAMPLES),
        cmArtifact: rebindArtifact(latestConfusionMatrix(events), artifactsDir),
        imageArtifact: rebindArtifact(latestArtifact(events, "image-grid"), artifactsDir),
        weightsArtifact: rebindArtifact(latestArtifact(events, "weights"), artifactsDir),
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
      const content = await readTextFile(`${run.dir}/metrics.jsonl`);
      if (content === null) return;
      const series = createSeriesMap();
      const metricNames = new Set<string>();
      for (const ev of parseProtocolLines(content.split("\n"))) {
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
    const { engineExe, engineKind, pendingExport } = get();
    if (!engineExe || pendingExport) return;
    // The Rust engine's `export` only speaks --onnx; `--run` is the Python
    // engine's HTML report. The panel hides the button, but guard anyway so
    // a stale click can't spawn a doomed process.
    if (engineKind === "rust") {
      set((s) => ({
        logs: pushLog(s.logs, "HTML reports need the Python engine"),
      }));
      return;
    }
    const reportPath = `${projectDir}/.nexis-ml/runs/${runId}/report.html`;
    set((s) => ({ logs: pushLog(s.logs, `$ nexis-ml export --run ${runId}`) }));
    try {
      const sid = await spawnExport(engineExe, projectDir, runId);
      set({ pendingExport: { sid, reportPath } });
    } catch (err) {
      set((s) => ({ logs: pushLog(s.logs, `export failed: ${String(err)}`) }));
    }
  },

  async exportOnnx(projectDir) {
    const { engineExe, engineKind, pendingOnnx, activeRun } = get();
    if (!engineExe || pendingOnnx) return;
    // Python-engine `export` has no --onnx (Rust engine feature, ML_SUITE M5).
    if (engineKind !== "rust") {
      set((s) => ({
        logs: pushLog(s.logs, "ONNX export needs the standalone (Rust) engine"),
      }));
      return;
    }
    if (activeRun && BUSY_RUN_STATES.includes(activeRun.status)) return;
    set((s) => ({
      logs: pushLog(s.logs, `$ nexis-ml export --onnx .  (${projectDir})`),
    }));
    try {
      const sid = await spawnExportOnnx(engineExe, projectDir);
      set({
        pendingOnnx: { sid, outPath: `${projectDir}/model.onnx`, projectDir },
      });
    } catch (err) {
      set((s) => ({
        logs: pushLog(s.logs, `ONNX export failed: ${String(err)}`),
      }));
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
          if (
            ev.kind !== "confusion-matrix" &&
            ev.kind !== "image-grid" &&
            ev.kind !== "weights"
          ) {
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

    // Artifacts arrive at most once per epoch, so only scan a batch that
    // actually carried one (the rebuilt paths are run-dir-relative so they
    // survive a moved project). Otherwise leave the existing refs in place.
    const hadArtifact = events.some((e) => e.ev === "artifact");
    const runArtifactDir = next.runId
      ? `${run.projectDir}/.nexis-ml/runs/${next.runId}/artifacts`
      : null;
    const cmArtifact = hadArtifact
      ? rebindArtifact(latestConfusionMatrix(events, run.epoch), runArtifactDir)
      : null;
    const imageArtifact = hadArtifact
      ? rebindArtifact(latestArtifact(events, "image-grid", run.epoch), runArtifactDir)
      : null;
    const weightsArtifact = hadArtifact
      ? rebindArtifact(latestArtifact(events, "weights", run.epoch), runArtifactDir)
      : null;

    set((s) => ({
      activeRun: next,
      lastValues,
      logs,
      ...(samples ? { samples } : {}),
      ...(cmArtifact ? { cmArtifact } : {}),
      ...(imageArtifact ? { imageArtifact } : {}),
      ...(weightsArtifact ? { weightsArtifact } : {}),
      seriesTick: s.seriesTick + 1,
    }));
    if (finishedProject) {
      void get().refreshRuns(finishedProject);
    }
  },

  _applyStderr(payload) {
    const { activeRun, installSid, pendingCreate, serve, pendingExport, pendingOnnx } =
      get();
    const known =
      payload.sid === activeRun?.sid ||
      payload.sid === installSid ||
      payload.sid === pendingCreate?.sid ||
      payload.sid === serve?.sid ||
      payload.sid === pendingExport?.sid ||
      payload.sid === pendingOnnx?.sid ||
      // Same window as the exit handler below: until `spawnInstall` resolves,
      // `installSid` is null and pip's own output — the only thing that says
      // *why* an install failed — was being dropped from the setup card's log.
      (installSid === null && get().installing);
    if (!known) return;
    set((s) => ({ logs: pushLog(s.logs, payload.line) }));
  },

  _applyExit(payload) {
    const { activeRun, installSid, pendingCreate, serve, pendingExport, pendingOnnx } =
      get();

    // ONNX export finished → reveal model.onnx + refresh the project badge
    if (pendingOnnx && payload.sid === pendingOnnx.sid) {
      const { outPath, projectDir } = pendingOnnx;
      set({ pendingOnnx: null });
      if (payload.code === 0) {
        set((s) => ({
          logs: pushLog(s.logs, `ONNX model written: ${outPath}`),
          projects: s.projects.map((p) =>
            p.dir === projectDir ? { ...p, hasOnnx: true } : p,
          ),
        }));
        void revealItemInDir(outPath).catch(() => {});
      } else {
        set((s) => ({
          logs: pushLog(
            s.logs,
            `ONNX export failed (exit ${payload.code ?? "?"}) — it supports tabular (CSV) models; see the log above`,
          ),
        }));
      }
      return;
    }

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

    // pip install step finished → next step, or re-probe for the engine.
    //
    // The `installSid === null && installing` arm closes a race that could
    // wedge the setup card permanently: `_startNextInstall` only records the
    // sid *after* `await spawnInstall(...)` resolves, so an install that dies
    // inside that window emitted an ml:exit matching nothing. Nothing else
    // clears `installing`, and the card disables both "Install engine" and
    // "Check again" while it is true — so a failed install left the panel
    // with no way back short of restarting the app. An unmatched exit while
    // an install is in flight can only be that install's.
    const unclaimedInstallExit =
      installSid === null &&
      get().installing &&
      payload.sid !== pendingCreate?.sid;
    if (payload.sid === installSid || unclaimedInstallExit) {
      const ok = payload.code === 0;
      const root = get().installRoot;
      if (ok && get().installQueue.length > 0) {
        set({ installSid: null });
        void get()._startNextInstall();
        return;
      }
      // The PyPI engine step failed → the package may not be published yet,
      // so fall back to installing it straight from GitHub before giving up.
      if (!ok && get().installFlavor === "default") {
        set((s) => ({
          installSid: null,
          installQueue: ["git"],
          logs: pushLog(s.logs, "couldn't get nexis-ml from PyPI — trying GitHub…"),
        }));
        void get()._startNextInstall();
        return;
      }
      set((s) => ({
        installing: false,
        installSid: null,
        installFlavor: null,
        installRoot: null,
        installQueue: [],
        engineError: ok
          ? null
          : `Install failed (exit ${payload.code ?? "?"}). See the log; you can also try the standalone engine.`,
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
          createError: `The engine couldn't scaffold the project (exit ${payload.code ?? "?"}). See the log.`,
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
