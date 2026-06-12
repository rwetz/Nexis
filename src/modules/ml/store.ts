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
  spawnInstall,
  spawnNew,
  spawnTrain,
  subscribeMlEvents,
  type ExitPayload,
  type InstallFlavor,
  type MlEnvInfo,
  type ProtoPayload,
  type StderrPayload,
} from "./lib/engine-bridge";
import { parseProtocolLines, type MetricStats, type RunSummary } from "./lib/protocol";
import { appendPoint, createSeriesMap, type Series } from "./lib/series";

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
};

const MAX_LOG_LINES = 200;
const MAX_RUNS_LISTED = 50;

// ── Module-level series buffers (deliberately outside Zustand) ────────────────

let seriesMap = createSeriesMap();

export function getSeriesMap(): Map<string, Series> {
  return seriesMap;
}

function resetSeries(): void {
  seriesMap = createSeriesMap();
}

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
  logs: string[];

  runs: HistoricalRun[];
  runsLoading: boolean;

  detect: (workspaceRoot: string | null) => Promise<void>;
  redetect: (workspaceRoot: string | null) => Promise<void>;
  installEngine: (workspaceRoot: string | null, useGpu: boolean) => Promise<void>;
  /** Swap the engine's CPU torch for the CUDA build. */
  upgradeToGpu: (workspaceRoot: string | null) => Promise<void>;
  refreshProjects: (workspaceRoot: string) => Promise<void>;
  selectProject: (dir: string) => void;
  createProject: (
    workspaceRoot: string,
    name: string,
    autoTrain: boolean,
  ) => Promise<void>;
  startTrain: (projectDir: string) => Promise<void>;
  cancelActive: () => Promise<void>;
  refreshRuns: (projectDir: string) => Promise<void>;
  loadHistoricalRun: (run: HistoricalRun) => Promise<void>;

  _startNextInstall: () => Promise<void>;
  _applyProto: (payload: ProtoPayload) => void;
  _applyStderr: (payload: StderrPayload) => void;
  _applyExit: (payload: ExitPayload) => void;
};

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
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
  logs: [],

  runs: [],
  runsLoading: false,

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
    set({ selectedProject: dir });
    void get().refreshRuns(dir);
  },

  async createProject(workspaceRoot, name, autoTrain) {
    const { engineExe, pendingCreate } = get();
    if (!engineExe || pendingCreate) return;
    const clean = name.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!clean) {
      set((s) => ({ logs: pushLog(s.logs, "project name can't be empty") }));
      return;
    }
    set((s) => ({
      logs: pushLog(s.logs, `$ nexis-ml new tabular ${clean}  (${workspaceRoot})`),
    }));
    try {
      const sid = await spawnNew(engineExe, workspaceRoot, clean);
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
          try {
            const res = await invoke<ReadResult>("fs_read_file", {
              path: `${dir}/summary.json`,
              workspace: currentWorkspaceEnv(),
            });
            if (res.kind === "text") {
              const summary = JSON.parse(res.content) as RunSummary;
              return {
                ...base,
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
          return base;
        }),
      );
      if (stillCurrent()) set({ runs, runsLoading: false });
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
      const lastValues: Record<string, number> = {};
      for (const ev of parseProtocolLines(res.content.split("\n"))) {
        if (ev.ev === "metric") {
          appendPoint(seriesMap, ev.name, ev.step, ev.value);
          lastValues[ev.name] = ev.value;
        }
      }
      set((s) => ({
        chartSource: { kind: "historical", runId: run.id },
        lastValues,
        seriesTick: s.seriesTick + 1,
      }));
    } catch (err) {
      set((s) => ({
        logs: pushLog(s.logs, `failed to load ${run.id}: ${String(err)}`),
      }));
    }
  },

  _applyProto(payload) {
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
        case "sample": {
          const text = `${String(ev.input ?? "")} → ${String(ev.output ?? "")}`;
          logs = pushLog(logs, `sample: ${text.slice(0, 200)}`);
          break;
        }
        case "artifact":
          // Phase 2 renders these; for now surface them in the log.
          logs = pushLog(logs, `artifact (${ev.kind}): ${ev.path}`);
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

    set((s) => ({
      activeRun: next,
      lastValues,
      logs,
      seriesTick: s.seriesTick + 1,
    }));
    if (finishedProject) {
      void get().refreshRuns(finishedProject);
    }
  },

  _applyStderr(payload) {
    const { activeRun, installSid, pendingCreate } = get();
    const known =
      payload.sid === activeRun?.sid ||
      payload.sid === installSid ||
      payload.sid === pendingCreate?.sid;
    if (!known) return;
    set((s) => ({ logs: pushLog(s.logs, payload.line) }));
  },

  _applyExit(payload) {
    const { activeRun, installSid, pendingCreate } = get();

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
