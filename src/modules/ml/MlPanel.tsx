// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * MlPanel ("ML Lab") — train small models without leaving Nexis.
 *
 * Designed so someone who has never trained a model can use it:
 *  - no engine → one-click install (or guided steps)
 *  - no project → one-click "Create & train" with example data
 *  - while training → progress bar, elapsed time, and a plain-language
 *    sentence about what the model is doing
 *  - metrics labeled "Accuracy", not "acc/val"; jargon lives in Details
 */
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "@/components/icon";
import { IS_WINDOWS } from "@/lib/platform";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  useMlStore,
  getSeriesMap,
  type ActiveRun,
  type CompareRun,
  type HistoricalRun,
  type PlaygroundResult,
  type ServeSession,
} from "./store";
import { MetricChart, CompareChart } from "./MetricChart";
import { NetworkGraph } from "./NetworkGraph";
import { Explain } from "./Explain";
import {
  displayMetric,
  formatElapsed,
  headlineMetric,
  runStatusWord,
  statusSentence,
  trendOf,
} from "./lib/friendly";
import {
  displayToRaw,
  fieldId,
  HP_FIELDS,
  rawToDisplay,
  type HpField,
} from "./lib/hyperparams";
import type { MetricStats, RunSummary } from "./lib/protocol";
import {
  engineSupportsTemplate,
  type EngineKind,
  type EnginePin,
  type MlEnvInfo,
  type MlTemplate,
} from "./lib/engine-bridge";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { readConfusionMatrix, type ConfusionMatrix } from "./lib/artifacts";
import { readTrainToml, writeTrainToml } from "./lib/config";
import {
  torchSupportWarning,
  TORCH_MAX_MINOR,
  TORCH_MIN_MINOR,
} from "./lib/pythonSupport";
import { tomlGet, tomlSet } from "./lib/toml-edit";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setMlAutoOpenOnTrain } from "@/modules/settings/store";
import {
  useWorkspaceEnvStore,
  workspaceScopeKey,
} from "@/modules/workspace";

/** Release feed for the standalone (Rust) engine — the WSL steps fetch the
 *  Linux build from here. The in-app download uses the Rust-side pin, not
 *  this URL; this is only what a human types into curl. */
const ENGINE_RELEASES_URL = "https://github.com/rwetz/nexis-ml-rs/releases";
/** Source repo for the Python engine, for the pip-from-git fallback. */
const ENGINE_PY_REPO = "https://github.com/rwetz/nexis-ml";

/** Project templates offered in the create card. */
const TEMPLATE_OPTIONS: {
  id: MlTemplate;
  label: string;
  desc: string;
  defaultName: string;
}[] = [
  {
    id: "tabular",
    label: "Spreadsheet",
    desc: "Predict a column in a CSV with a small neural net.",
    defaultName: "my-first-model",
  },
  {
    id: "textgen",
    label: "Text generator",
    desc: "Train a tiny GPT on a .txt file and watch it learn to write.",
    defaultName: "tiny-writer",
  },
  {
    id: "image",
    label: "Image classifier",
    desc: "Train a small CNN on folders of images, one folder per class.",
    defaultName: "image-classifier",
  },
  {
    id: "blank",
    label: "Blank",
    desc: "Start from scratch — design your own network in train.py.",
    defaultName: "my-network",
  },
];

type Props = {
  workspaceRoot: string | null;
  /** Detach the network diagram into its own tab. Optional so the panel
   *  still renders standalone (tests, storybook-style usage). */
  onOpenNetworkTab?: (input: { projectDir: string }) => void;
};

const BUSY_STATES = ["starting", "running", "cancelling"];


/** One labelled figure in the run-details grid. Reads nothing from the panel,
 *  so it is built once rather than per render. */
const cell = (label: ReactNode, value: ReactNode, key: string) => (
  <div key={key} className="flex min-w-0 flex-col">
    <span className="truncate text-[9.5px] uppercase tracking-wide text-muted-foreground/60">
      {label}
    </span>
    <span className="truncate font-mono text-[10.5px] tabular-nums text-foreground/90">
      {value}
    </span>
  </div>
);

export function MlPanel({ workspaceRoot, onOpenNetworkTab }: Props) {
  const engineStatus = useMlStore((s) => s.engineStatus);
  const engineVersion = useMlStore((s) => s.engineVersion);
  const engineKind = useMlStore((s) => s.engineKind);
  const engineError = useMlStore((s) => s.engineError);
  const installPython = useMlStore((s) => s.installPython);
  const installPythonVersion = useMlStore((s) => s.installPythonVersion);
  const installing = useMlStore((s) => s.installing);
  const downloadingEngine = useMlStore((s) => s.downloadingEngine);
  const enginePin = useMlStore((s) => s.enginePin);
  const engineCandidates = useMlStore((s) => s.engineCandidates);
  const managedEngine = useMlStore((s) => s.managedEngine);
  const envInfo = useMlStore((s) => s.envInfo);
  const hostGpu = useMlStore((s) => s.hostGpu);
  const projects = useMlStore((s) => s.projects);
  const selectedProject = useMlStore((s) => s.selectedProject);
  const pendingCreate = useMlStore((s) => s.pendingCreate);
  const createError = useMlStore((s) => s.createError);
  const activeRun = useMlStore((s) => s.activeRun);
  const lastSummary = useMlStore((s) => s.lastSummary);
  const chartSource = useMlStore((s) => s.chartSource);
  const lastValues = useMlStore((s) => s.lastValues);
  const logs = useMlStore((s) => s.logs);
  const runs = useMlStore((s) => s.runs);
  const runsLoading = useMlStore((s) => s.runsLoading);
  const compareRuns = useMlStore((s) => s.compareRuns);

  const detect = useMlStore((s) => s.detect);
  const redetect = useMlStore((s) => s.redetect);
  const upgradeToGpu = useMlStore((s) => s.upgradeToGpu);
  const downloadStandaloneEngine = useMlStore((s) => s.downloadStandaloneEngine);
  const installLocalCopy = useMlStore((s) => s.installLocalCopy);
  const uninstallManagedEngine = useMlStore((s) => s.uninstallManagedEngine);
  const uninstallingEngine = useMlStore((s) => s.uninstallingEngine);
  const refreshProjects = useMlStore((s) => s.refreshProjects);
  const selectProject = useMlStore((s) => s.selectProject);
  const createProject = useMlStore((s) => s.createProject);
  const startTrain = useMlStore((s) => s.startTrain);
  const cancelActive = useMlStore((s) => s.cancelActive);
  const pauseActive = useMlStore((s) => s.pauseActive);
  const resumeActive = useMlStore((s) => s.resumeActive);
  const refreshRuns = useMlStore((s) => s.refreshRuns);
  const loadHistoricalRun = useMlStore((s) => s.loadHistoricalRun);
  const toggleCompare = useMlStore((s) => s.toggleCompare);
  const clearCompare = useMlStore((s) => s.clearCompare);
  const setRunMeta = useMlStore((s) => s.setRunMeta);
  const exportReport = useMlStore((s) => s.exportReport);
  const pendingExport = useMlStore((s) => s.pendingExport);
  const exportOnnx = useMlStore((s) => s.exportOnnx);
  const pendingOnnx = useMlStore((s) => s.pendingOnnx);
  const autoOpenOnTrain = usePreferencesStore((s) => s.mlAutoOpenOnTrain);

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const workspaceScope = workspaceScopeKey(workspaceEnv);
  const wslDistro = workspaceEnv.kind === "wsl" ? workspaceEnv.distro : null;

  const [showCreate, setShowCreate] = useState(false);

  // `workspaceScope` is a dependency in its own right: switching Windows↔WSL
  // can leave the root string untouched (or change it long before the engine
  // facts are re-derived), and every engine answer belongs to exactly one
  // environment. Re-detect on either.
  useEffect(() => {
    void detect(workspaceRoot);
    if (workspaceRoot) void refreshProjects(workspaceRoot);
  }, [workspaceRoot, workspaceScope, detect, refreshProjects]);

  const busy = activeRun != null && BUSY_STATES.includes(activeRun.status);
  const finished =
    activeRun != null && ["ok", "cancelled", "error"].includes(activeRun.status);
  // 2+ runs checked → overlay them instead of the single-run views.
  const comparing = compareRuns.length >= 2;

  const metricNames = useMemo(() => Object.keys(lastValues).sort(), [lastValues]);
  const hero = useMemo(() => headlineMetric(metricNames), [metricNames]);
  const restMetrics = useMemo(
    () => metricNames.filter((n) => n !== hero),
    [metricNames, hero],
  );

  // The run currently in view (a finished live run, or a loaded historical
  // one) — what the playground and "Export report" act on.
  const viewedRun =
    finished && activeRun?.runId
      ? { projectDir: activeRun.projectDir, runId: activeRun.runId }
      : chartSource?.kind === "historical" && selectedProject
        ? { projectDir: selectedProject, runId: chartSource.runId }
        : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide">ML Lab</span>
          <EngineChip
            status={engineStatus}
            version={engineVersion}
            kind={engineKind}
            envInfo={envInfo}
          />
          {engineStatus === "ready" &&
          (envInfo?.cudaAvailable || envInfo?.backend === "wgpu") ? (
            <span
              className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-px text-[10px] text-emerald-500"
              title={
                envInfo?.gpuName ??
                (envInfo?.backend === "wgpu" ? "GPU via wgpu" : "CUDA available")
              }
            >
              <Icon name="flash" size="xs" />
              GPU
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Refresh"
          onClick={() => {
            if (workspaceRoot) {
              void refreshProjects(workspaceRoot);
              if (selectedProject) void refreshRuns(selectedProject);
            }
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <Icon name="refresh" size="xs" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {!workspaceRoot ? (
          <p className="text-[11px] text-muted-foreground">
            Open a folder to start training models in it.
          </p>
        ) : engineStatus === "missing" ? (
          <SetupCard
            installPythonVersion={installPythonVersion}
            downloadingEngine={downloadingEngine}
            pin={enginePin}
            wslDistro={wslDistro}
            candidates={engineCandidates}
            hostGpu={hostGpu}
            logs={logs}
            error={engineError}
            onDownloadEngine={() => void downloadStandaloneEngine()}
            onInstallLocal={(path) => void installLocalCopy(path)}
            onRetry={() => void redetect(workspaceRoot)}
          />
        ) : engineStatus === "detecting" || engineStatus === "idle" ? (
          <p className="text-[11px] text-muted-foreground">
            Looking for the training engine…
          </p>
        ) : (
          <>
            {/* GPU available on the machine but the engine can't use it.
                Python-engine only: the upsell installs the CUDA torch build,
                which is meaningless for the Rust engine (it uses wgpu). */}
            {hostGpu &&
            envInfo &&
            !envInfo.cudaAvailable &&
            installPython &&
            engineKind === "python" ? (
              <GpuUpsell
                gpuName={hostGpu}
                installing={installing}
                logs={logs}
                onUpgrade={() => void upgradeToGpu(workspaceRoot)}
              />
            ) : null}
            {/* Models discovered in this folder */}
            {projects.length > 0 ? (
              <div className="mb-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Models
                </p>
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedProject ?? ""}
                    onChange={(e) => selectProject(e.target.value)}
                    aria-label="Select project"
                    disabled={busy}
                    className="h-6 min-w-0 flex-1 truncate rounded border border-border bg-background px-1.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                  >
                    {projects.map((p) => (
                      <option key={p.dir} value={p.dir}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {projects.find((p) => p.dir === selectedProject)?.hasOnnx ? (
                    <Explain term="onnx">
                      <button
                        type="button"
                        onClick={() =>
                          void revealItemInDir(`${selectedProject}/model.onnx`).catch(
                            () => {},
                          )
                        }
                        className="h-6 shrink-0 rounded border border-sky-500/40 bg-sky-500/[0.06] px-1.5 text-[10px] font-medium text-sky-500"
                        title="model.onnx — click to reveal"
                      >
                        ONNX
                      </button>
                    </Explain>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    disabled={busy}
                    className="h-6 shrink-0 rounded border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    title="Create a new model"
                  >
                    + New
                  </button>
                </div>
              </div>
            ) : !showCreate && !pendingCreate ? (
              <div className="mb-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                <p className="text-[11px] font-medium text-foreground/90">
                  No models in this folder.
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/70">
                  A model lives in a project folder with a{" "}
                  <span className="font-mono">train.toml</span>. Models trained
                  here (or by <span className="font-mono">nexis-ml</span> in a
                  terminal) show up automatically.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="mt-1.5 rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  New model…
                </button>
              </div>
            ) : null}
            {showCreate || pendingCreate ? (
              <CreateCard
                creating={pendingCreate != null}
                createError={createError}
                engineKind={engineKind}
                onCreate={(template, name, autoTrain) => {
                  setShowCreate(false);
                  void createProject(workspaceRoot, template, name, autoTrain);
                }}
                onDismiss={() => setShowCreate(false)}
              />
            ) : null}

            {/* Train hero / progress / result */}
            {busy && activeRun ? (
              <ProgressBlock
                run={activeRun}
                onCancel={() => void cancelActive()}
                onPause={() => void pauseActive()}
                onResume={() => void resumeActive()}
              />
            ) : finished && activeRun ? (
              <ResultCard
                run={activeRun}
                summary={lastSummary}
                onTrainAgain={() => void startTrain(activeRun.projectDir)}
              />
            ) : selectedProject && projects.length > 0 && !pendingCreate ? (
              <button
                type="button"
                onClick={() => void startTrain(selectedProject)}
                className="mb-2 w-full rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                ▶ Train model
              </button>
            ) : null}

            {/* Hyperparameters — tweak train.toml without leaving the panel */}
            {selectedProject && !busy && !pendingCreate && projects.length > 0 ? (
              <HyperparamForm
                key={selectedProject}
                projectDir={selectedProject}
                onSaveTrain={() => void startTrain(selectedProject)}
              />
            ) : null}

            {/* The model itself — architecture graph (weights overlay once
                the engine emits a `weights` artifact; ML_SUITE.md contract) */}
            {selectedProject && !pendingCreate && projects.length > 0 ? (
              <NetworkGraph
                key={`net-${selectedProject}`}
                projectDir={selectedProject}
                onOpenAsTab={
                  onOpenNetworkTab
                    ? () => onOpenNetworkTab({ projectDir: selectedProject })
                    : undefined
                }
              />
            ) : null}

            {comparing ? (
              /* Overlay several runs on shared charts */
              <ComparisonView runs={compareRuns} onClear={clearCompare} />
            ) : (
              <>
                {/* Facts about the run in view — id, device, duration, best/last metrics */}
                <RunDetails />

                {/* Generated text (textgen) — the payoff, above the charts */}
                <SamplesView />

                {/* Charts */}
                {metricNames.length > 0 ? (
                  <div className="mb-2 mt-2 flex flex-col gap-2">
                    {chartSource?.kind === "historical" ? (
                      <p className="text-[10px] text-muted-foreground">
                        Viewing a past run ({friendlyRunName(chartSource.runId)})
                      </p>
                    ) : null}
                    {hero ? <MetricChart name={hero} hero /> : null}
                    {restMetrics.map((name) => (
                      <MetricChart key={name} name={name} />
                    ))}
                  </div>
                ) : null}

                {/* Confusion matrix (classification) — per-epoch artifact grid */}
                <ConfusionMatrixView />

                {/* Sample-prediction grid (image template) */}
                <ImageGridView />

                {/* Inference playground — try the trained model live.
                    Capability-gated: the Python engine has always had
                    `serve`; the standalone Rust engine implements it from
                    v0.8 and reports it via the env probe's `serve` flag. */}
                {engineKind !== "rust" || envInfo?.serve ? (
                  <Playground run={viewedRun} />
                ) : viewedRun ? (
                  <p className="mb-1 mt-3 text-[10px] leading-snug text-muted-foreground/70">
                    This engine version can't serve models — update the
                    standalone engine (v0.8+) for in-panel inference, or
                    export to{" "}
                    <Explain term="onnx">
                      <span>ONNX</span>
                    </Explain>{" "}
                    below and run the model with onnxruntime anywhere.
                  </p>
                ) : null}

                {/* Exports: HTML report (Python engine) / ONNX (Rust engine) */}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {viewedRun && engineKind !== "rust" ? (
                    <button
                      type="button"
                      disabled={pendingExport != null}
                      onClick={() =>
                        void exportReport(viewedRun.projectDir, viewedRun.runId)
                      }
                      className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      {pendingExport ? "Exporting…" : "⤓ Export HTML report"}
                    </button>
                  ) : null}
                  {selectedProject && engineKind === "rust" ? (
                    <Explain term="onnx">
                      <button
                        type="button"
                        disabled={pendingOnnx != null || busy}
                        onClick={() => void exportOnnx(selectedProject)}
                        className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        {pendingOnnx ? "Exporting ONNX…" : "⤓ Export ONNX model"}
                      </button>
                    </Explain>
                  ) : null}
                </div>
              </>
            )}

            {/* Details (logs, raw output) — collapsed so novices never see it */}
            {logs.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer select-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground">
                  Details
                </summary>
                <LogView logs={logs} />
              </details>
            ) : null}

            {/* Past runs */}
            <div className="mt-3">
              <p className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                <span>Past runs {runsLoading ? "…" : ""}</span>
                {runs.length > 1 ? (
                  <span className="font-normal normal-case tracking-normal text-muted-foreground/50">
                    check 2+ to compare
                  </span>
                ) : null}
              </p>
              {runs.length === 0 && !runsLoading ? (
                <p className="text-[11px] text-muted-foreground/70">
                  Runs you train will show up here.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      selected={
                        chartSource?.kind === "historical" &&
                        chartSource.runId === run.id
                      }
                      comparing={compareRuns.some((r) => r.id === run.id)}
                      compareColor={compareRuns.find((r) => r.id === run.id)?.color}
                      disabled={busy}
                      onClick={() => void loadHistoricalRun(run)}
                      onToggleCompare={() => void toggleCompare(run)}
                      onSaveMeta={(patch) => void setRunMeta(run, patch)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Settings */}
            <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={autoOpenOnTrain}
                onChange={(e) => void setMlAutoOpenOnTrain(e.target.checked)}
                className="size-3 accent-primary"
              />
              Open this panel automatically when training starts
            </label>

            {/* Managed (downloaded) engine footprint + uninstall. Engines
                found in venvs/PATH are not Nexis's to remove. */}
            {managedEngine?.installed ? (
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  Downloaded engine on disk:{" "}
                  {Math.max(
                    1,
                    Math.round(managedEngine.sizeBytes / (1024 * 1024)),
                  )}{" "}
                  MB
                </span>
                <button
                  type="button"
                  disabled={
                    busy || downloadingEngine || installing || uninstallingEngine
                  }
                  onClick={() => void uninstallManagedEngine(workspaceRoot)}
                  title="Deletes the downloaded engine binary and frees the disk space. Engines installed in a venv or on PATH are unaffected; you can re-download any time."
                  className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                >
                  {uninstallingEngine ? "Removing…" : "Remove"}
                </button>
              </div>
            ) : null}
            {/* Engine errors used to be rendered only by SetupCard, which is
                gone once an engine is detected — so a failed uninstall (or any
                other post-setup engine failure) was swallowed and the click
                looked like it had done nothing at all. */}
            {engineError ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-snug text-red-400">
                <Icon name="alert-circle" size="xs" className="mt-px shrink-0" />
                <span>{engineError}</span>
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * "GPU" / "CPU" for a run or serve session's reported device. The GPU case
 * carries a lightning icon rather than the emoji it used to: icons come from
 * the one `<Icon>` choke point (pitfall #18) and inherit the theme's colour
 * and the house size scale, which an emoji glyph cannot.
 */
function DeviceLabel({ device }: { device: string }) {
  if (!device.startsWith("cuda")) return <>CPU</>;
  return (
    <span className="flex items-center gap-0.5">
      <Icon name="flash" size="xs" />
      GPU
    </span>
  );
}

// ── Setup (engine missing) ────────────────────────────────────────────────────

function SetupCard({
  installPythonVersion,
  downloadingEngine,
  pin,
  wslDistro,
  candidates,
  hostGpu,
  logs,
  error,
  onDownloadEngine,
  onInstallLocal,
  onRetry,
}: {
  /** Version of the interpreter Nexis found, if any — used only to warn in
   *  the manual Python steps. Nexis no longer installs into it itself. */
  installPythonVersion: string | null;
  downloadingEngine: boolean;
  pin: EnginePin | null;
  /** Distro name when this is a WSL workspace — the engine then has to live
   *  inside the distro, and the host-side download does not apply. */
  wslDistro: string | null;
  /** Paths the last detection probed, so "not found" can say where it looked. */
  candidates: string[];
  hostGpu: string | null;
  logs: string[];
  error: string | null;
  onDownloadEngine: () => void;
  onInstallLocal: (path: string) => void;
  onRetry: () => void;
}) {
  // The standalone download goes through an explicit consent step showing
  // exactly what will be fetched and the checksum it must match (V3).
  const [confirmingDownload, setConfirmingDownload] = useState(false);
  const [localPath, setLocalPath] = useState("");
  const pinMb = pin ? Math.max(1, Math.round(pin.sizeBytes / (1024 * 1024))) : null;
  const pinAsset = pin?.url.split("/").pop() ?? "the release binary";
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
      <p className="mb-1 text-[12px] font-semibold">Set up the ML engine</p>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        Nexis trains models with a small local tool called{" "}
        <span className="font-mono">nexis-ml</span>. Everything runs on your
        machine — no cloud, no accounts.
      </p>
      {wslDistro ? (
        <p className="mb-2 flex items-start gap-1.5 rounded border border-border/50 bg-background/50 p-1.5 text-[10.5px] leading-snug text-muted-foreground">
          <Icon name="server" size="xs" className="mt-px shrink-0" />
          <span>
            This workspace is <span className="font-mono">{wslDistro}</span>, so
            the engine has to live inside the distro — a Windows install is a
            different machine as far as your project is concerned.
          </span>
        </p>
      ) : null}

      {downloadingEngine ? (
        <>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] text-foreground/90">
            <span className="size-1.5 nexis-blink rounded-full bg-sky-500" />
            Downloading and verifying the standalone engine
            {pinMb ? ` (~${pinMb} MB)` : ""}…
          </p>
          <LogView logs={logs} />
        </>
      ) : wslDistro ? (
        // The download installs a *host* binary into the host's app-data dir.
        // Inside a distro it is neither reachable nor runnable, so a WSL
        // workspace gets the manual route as its primary path.
        <WslEngineSteps distro={wslDistro} />
      ) : confirmingDownload && pin ? (
        <div className="rounded-md border border-border/60 bg-background/60 p-2">
          <p className="mb-1 text-[11px] font-semibold">
            Download nexis-ml {pin.version}?
          </p>
          <dl className="mb-1.5 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            <div className="flex gap-1">
              <dt className="shrink-0 text-muted-foreground/60">From</dt>
              <dd className="min-w-0 truncate font-mono" title={pin.url}>
                github.com/rwetz/nexis-ml-rs · {pinAsset}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 text-muted-foreground/60">Size</dt>
              <dd>{pinMb} MB</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 text-muted-foreground/60">SHA-256</dt>
              <dd className="min-w-0 truncate font-mono" title={pin.sha256}>
                {pin.sha256}
              </dd>
            </div>
          </dl>
          <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground/70">
            Nexis verifies the download against this pinned checksum before it
            can run. This is the only thing the ML Lab ever downloads.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setConfirmingDownload(false);
                onDownloadEngine();
              }}
              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Download &amp; verify
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDownload(false)}
              className="rounded-md border border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() =>
              // No pin = no prebuilt for this platform; let the store surface
              // its "not available" error instead of consenting to nothing.
              pin ? setConfirmingDownload(true) : onDownloadEngine()
            }
            className="mb-1.5 w-full rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Download engine{pinMb ? ` (~${pinMb} MB)` : ""}
          </button>
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            One verified binary from the project&apos;s GitHub releases. No
            Python, no PyTorch, nothing else to install. Trains tabular and
            image models
            {hostGpu ? ` on your ${hostGpu}` : " on your GPU"} through wgpu — no
            CUDA toolchain — with the inference playground built in.
          </p>
          {pin ? (
            <details className="mt-1.5">
              <summary className="cursor-pointer select-none text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
                Offline? Install from a local copy
              </summary>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
                Download <span className="font-mono">{pinAsset}</span> from the{" "}
                {pin.version} release on another machine, bring it over, and
                point Nexis at the file. The same checksum check applies.
              </p>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="text"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder={`/path/to/${pinAsset}`}
                  className="min-w-0 flex-1 rounded border border-border/60 bg-background px-2 py-1 font-mono text-[10px] outline-none placeholder:text-muted-foreground/40 focus:border-foreground/40"
                />
                <button
                  type="button"
                  disabled={!localPath.trim()}
                  onClick={() => onInstallLocal(localPath)}
                  className="rounded border border-border/60 px-2 py-1 text-[10px] font-medium text-foreground/90 transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Verify &amp; install
                </button>
              </div>
            </details>
          ) : null}
        </>
      )}

      {error && !downloadingEngine ? (
        <div className="mt-1.5">
          <p className="text-[10.5px] leading-snug text-red-400">{error}</p>
          {/* Where it looked. "No engine found" is only actionable if you can
              see the search path — the usual cause is an engine installed in
              an environment the scan never visits, which is invisible
              otherwise. */}
          {candidates.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer select-none text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
                Where Nexis looked ({candidates.length})
              </summary>
              {/* `leading-none` is inherited here from the card's tight type
                  scale, which made 9.5px monospace rows overlap into an
                  unreadable smear. Line height has to be set explicitly
                  alongside an arbitrary font size — Tailwind's `text-[…]`
                  sets size only. */}
              <ul className="mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto">
                {candidates.map((c) => (
                  <li
                    key={c}
                    className="truncate font-mono text-[9.5px] leading-[1.6] text-muted-foreground/60"
                    title={c}
                  >
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
                An engine outside these paths is not found. Put it on{" "}
                <span className="font-mono">PATH</span>, or install it into a{" "}
                <span className="font-mono">.venv</span> in this folder or one
                above it.
              </p>
            </details>
          ) : null}
        </div>
      ) : null}

      {!downloadingEngine ? (
        <div className="mt-2 border-t border-border/40 pt-2">
          <PythonEngineSteps
            detectedVersion={installPythonVersion}
            wslDistro={wslDistro}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRetry}
        disabled={downloadingEngine}
        className="mt-1.5 text-[10.5px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
      >
        I installed it — check again
      </button>
    </div>
  );
}

/**
 * Getting the standalone engine into a WSL distro.
 *
 * The pinned download is a host binary in the host's app-data directory, so
 * it cannot serve a distro — but the same release publishes a Linux build,
 * and dropping it on the distro's PATH is a three-line job. Written out
 * rather than automated: doing it for the user would mean a second download
 * pipeline, a second pin, and a checksum path that has to run inside the
 * distro, none of which is worth it while this is a handful of commands.
 */
function WslEngineSteps({ distro }: { distro: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] leading-snug text-muted-foreground">
        In a <span className="font-mono">{distro}</span> terminal, put the
        Linux build of the engine on your PATH:
      </p>
      <CopyLine command={`mkdir -p ~/.local/bin && curl -fL -o ~/.local/bin/nexis-ml ${ENGINE_RELEASES_URL}/latest/download/nexis-ml-linux-x64`} />
      <CopyLine command="chmod +x ~/.local/bin/nexis-ml" />
      <CopyLine command="nexis-ml --version" />
      <p className="text-[10px] leading-snug text-muted-foreground/70">
        If the last command prints a version, hit “check again” below.{" "}
        <span className="font-mono">~/.local/bin</span> is on the default PATH
        for most distros — if <span className="font-mono">nexis-ml</span> is
        not found, open a fresh terminal or add it to your shell profile.
      </p>
    </div>
  );
}

/**
 * The Python engine, as documentation rather than a button.
 *
 * Nexis used to run `pip install nexis-ml[torch]` itself. That is deprecated:
 * it committed to a ~3 GB download into an interpreter the user had not
 * chosen (with no venv anywhere, that is the machine-wide Python), and the
 * most common outcome on a current machine is pip discovering after several
 * minutes that PyTorch has no wheels for the installed CPython. Neither the
 * environment choice nor the version constraint is Nexis's to make silently,
 * so both are now stated and the commands are handed over.
 */
function PythonEngineSteps({
  detectedVersion,
  wslDistro,
}: {
  detectedVersion: string | null;
  wslDistro: string | null;
}) {
  const warning = torchSupportWarning(detectedVersion);
  const win = !wslDistro && IS_WINDOWS;
  return (
    <details>
      <summary className="cursor-pointer select-none text-[10.5px] font-medium text-muted-foreground hover:text-foreground">
        Need text generation? Set up the Python engine
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5">
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          Almost everything works on the engine above. The Python engine adds
          three things it cannot do: <strong>text generation</strong> (the{" "}
          <span className="font-mono">textgen</span> template), the{" "}
          <span className="font-mono">blank</span> template — a{" "}
          <span className="font-mono">train.py</span> you write yourself — and
          the self-contained HTML run report. It costs a ~3 GB PyTorch download
          and a Python you maintain.
        </p>
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          <strong className="text-foreground/90">
            Use a virtualenv, not your system Python.
          </strong>{" "}
          PyTorch is large and version-pinned; installing it machine-wide
          affects every other Python project you have. Nexis looks for{" "}
          <span className="font-mono">.venv</span> in this folder and the six
          above it, so a venv here is found automatically.
        </p>
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          <strong className="text-foreground/90">
            Python 3.{TORCH_MIN_MINOR}–3.{TORCH_MAX_MINOR} only.
          </strong>{" "}
          PyTorch publishes no wheels for a newer CPython until months after it
          ships, and pip only says so after resolving — so a too-new
          interpreter downloads for minutes and ends at “No matching
          distribution found for torch”.
        </p>
        {warning ? (
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-500">
            <Icon name="alert" size="xs" className="mt-px shrink-0" />
            <span>{warning}</span>
          </p>
        ) : null}
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          In a terminal at this folder:
        </p>
        <CopyLine command={win ? "py -3.13 -m venv .venv" : "python3.13 -m venv .venv"} />
        <CopyLine
          command={
            win
              ? ".venv\\Scripts\\python -m pip install --upgrade nexis-ml[torch]"
              : ".venv/bin/python -m pip install --upgrade nexis-ml[torch]"
          }
        />
        <CopyLine
          command={win ? ".venv\\Scripts\\nexis-ml --version" : ".venv/bin/nexis-ml --version"}
        />
        <p className="text-[10px] leading-snug text-muted-foreground/70">
          For an NVIDIA card, install the CUDA build of torch first — otherwise
          pip resolves the CPU one and training stays on the CPU:
        </p>
        <CopyLine
          command={
            win
              ? ".venv\\Scripts\\python -m pip install torch --index-url https://download.pytorch.org/whl/cu130"
              : ".venv/bin/python -m pip install torch --index-url https://download.pytorch.org/whl/cu130"
          }
        />
        <p className="text-[10px] leading-snug text-muted-foreground/70">
          If <span className="font-mono">nexis-ml --version</span> prints a
          version, hit “check again” below. If pip cannot find{" "}
          <span className="font-mono">nexis-ml</span> at all, it is not on PyPI
          for your platform yet — install it from source with{" "}
          <span className="font-mono">
            pip install &quot;nexis-ml[torch] @ git+{ENGINE_PY_REPO}&quot;
          </span>
          .
        </p>
      </div>
    </details>
  );
}

function GpuUpsell({
  gpuName,
  installing,
  logs,
  onUpgrade,
}: {
  gpuName: string;
  installing: boolean;
  logs: string[];
  onUpgrade: () => void;
}) {
  return (
    <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.05] p-2">
      {installing ? (
        <>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] text-foreground/90">
            <span className="size-1.5 nexis-blink rounded-full bg-emerald-500" />
            Installing the GPU build (~3 GB) — keep this window open…
          </p>
          <LogView logs={logs} />
        </>
      ) : (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[10.5px] leading-snug text-muted-foreground">
            Your <span className="text-foreground/90">{gpuName}</span> isn't
            being used yet — the engine has the CPU-only build of PyTorch.
          </p>
          <button
            type="button"
            onClick={onUpgrade}
            className="shrink-0 rounded border border-emerald-500/40 px-2 py-0.5 text-[10.5px] font-medium text-emerald-500 transition-colors hover:bg-emerald-500/10"
          >
            Enable GPU
          </button>
        </div>
      )}
    </div>
  );
}

function CopyLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <code className="flex-1 truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
        {command}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(command);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ── Project creation ──────────────────────────────────────────────────────────

function CreateCard({
  creating,
  createError,
  engineKind,
  onCreate,
  onDismiss,
}: {
  creating: boolean;
  createError: string | null;
  engineKind: EngineKind | null;
  onCreate: (template: MlTemplate, name: string, autoTrain: boolean) => void;
  onDismiss?: () => void;
}) {
  const [template, setTemplate] = useState<MlTemplate>("tabular");
  const [name, setName] = useState(TEMPLATE_OPTIONS[0].defaultName);
  const [autoTrain, setAutoTrain] = useState(false);

  // Switching template swaps in its suggested name (the user can still
  // rename); keeps "tiny-writer" from sticking on a tabular project.
  const pick = (id: MlTemplate) => {
    setTemplate(id);
    setName(TEMPLATE_OPTIONS.find((o) => o.id === id)?.defaultName ?? name);
  };

  // If the active engine can't scaffold the selected template — e.g. the
  // standalone Rust engine resolved after the card mounted — fall back to
  // the first one it can, so the Create button never starts a doomed run.
  useEffect(() => {
    if (engineSupportsTemplate(template, engineKind)) return;
    const fallback = TEMPLATE_OPTIONS.find((o) =>
      engineSupportsTemplate(o.id, engineKind),
    );
    if (fallback) {
      setTemplate(fallback.id);
      setName(fallback.defaultName);
    }
  }, [engineKind, template]);

  // Show only templates the active engine can actually scaffold. The Rust
  // engine is config-only, so textgen and the code-it-yourself `blank`
  // project (both hinge on a hand-editable train.py) are hidden while it's
  // active — you only ever see options that will work. An unknown engine
  // kind (probe still pending) shows everything; the engine validates too.
  const templateOptions = TEMPLATE_OPTIONS.filter((o) =>
    engineSupportsTemplate(o.id, engineKind),
  );

  return (
    <div className="mb-2 rounded-md border border-primary/25 bg-primary/[0.04] p-2.5">
      <div className="mb-1 flex items-start justify-between">
        <p className="text-[12px] font-semibold">New model</p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="leading-none text-muted-foreground hover:text-foreground"
          >
            <Icon name="close" size="sm" />
          </button>
        ) : null}
      </div>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        Scaffolds a project folder in this workspace:{" "}
        <span className="font-mono">train.toml</span> for the settings and a{" "}
        <span className="font-mono">data/</span> folder for your files (with
        starter data so the setup is verifiable — replace it with your own).
      </p>

      {/* Template chooser — only options the active engine can scaffold */}
      <div className="mb-2 flex flex-col gap-1">
        {templateOptions.map((opt) => {
          const selected = opt.id === template;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={creating}
              onClick={() => pick(opt.id)}
              className={cn(
                "rounded border px-2 py-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-primary/50 bg-primary/[0.07]"
                  : "border-border hover:bg-foreground/[0.04]",
              )}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/90">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    selected ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
                {opt.label}
              </span>
              <span className="ml-3 block text-[10px] leading-snug text-muted-foreground">
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Factual note when the standalone engine hides templates. */}
      {templateOptions.length < TEMPLATE_OPTIONS.length ? (
        <p className="mb-2 text-[10px] leading-snug text-muted-foreground/70">
          Text generation and the code-your-own Blank project need the Python
          engine — the standalone engine is config-driven.
        </p>
      ) : null}

      {creating ? (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/90">
          <span className="size-1.5 nexis-blink rounded-full bg-sky-500" />
          Creating project…
        </p>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim())
                  onCreate(template, name, autoTrain);
              }}
              aria-label="New project name"
              spellCheck={false}
              className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            />
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => onCreate(template, name, autoTrain)}
              className="h-6 shrink-0 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create
            </button>
          </div>
          <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={autoTrain}
              onChange={(e) => setAutoTrain(e.target.checked)}
              className="size-3 accent-primary"
            />
            Start training right away (otherwise review the hyperparameters
            first)
          </label>
        </>
      )}
      {createError && !creating ? (
        <p className="mt-1.5 text-[10.5px] leading-snug text-red-400">
          {createError}
        </p>
      ) : null}
    </div>
  );
}

// ── Run details (facts about the run in view) ─────────────────────────────────

/** What RunDetails needs, whichever source the run came from. */
type RunFacts = {
  id: string;
  status: string;
  device: string | null;
  lastEpoch: number | null;
  totalEpochs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  metrics: Record<string, MetricStats>;
};

function factsFromSummary(id: string, s: RunSummary): RunFacts {
  return {
    id,
    status: s.status,
    device: s.device ?? null,
    lastEpoch: s.lastEpoch ?? null,
    totalEpochs: s.totalEpochs ?? null,
    startedAt: s.startedAt ?? null,
    finishedAt: s.finishedAt ?? null,
    metrics: s.metrics ?? {},
  };
}

function runDuration(facts: RunFacts): string | null {
  if (!facts.startedAt || !facts.finishedAt) return null;
  const ms = Date.parse(facts.finishedAt) - Date.parse(facts.startedAt);
  return Number.isFinite(ms) && ms >= 0 ? formatElapsed(ms) : null;
}

/**
 * Diagnostics strip for the run in view (a just-finished live run or a
 * loaded historical one): identity, device, passes, duration, and each
 * metric's best + final value — every label hover-explained.
 */
function RunDetails() {
  const activeRun = useMlStore((s) => s.activeRun);
  const lastSummary = useMlStore((s) => s.lastSummary);
  const chartSource = useMlStore((s) => s.chartSource);
  const runs = useMlStore((s) => s.runs);

  let facts: RunFacts | null = null;
  if (chartSource?.kind === "historical") {
    const run = runs.find((r) => r.id === chartSource.runId);
    if (run) {
      facts = {
        id: run.id,
        status: run.status,
        device: run.device ?? null,
        lastEpoch: run.lastEpoch ?? null,
        totalEpochs: run.totalEpochs ?? null,
        startedAt: run.startedAt ?? null,
        finishedAt: run.finishedAt ?? null,
        metrics: run.metrics ?? {},
      };
    }
  } else if (
    activeRun &&
    ["ok", "cancelled", "error"].includes(activeRun.status) &&
    lastSummary
  ) {
    facts = factsFromSummary(activeRun.runId ?? "run", lastSummary);
  }
  if (!facts) return null;

  const duration = runDuration(facts);
  const metricNames = Object.keys(facts.metrics).sort();

  return (
    <div className="mb-2 mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Run details
        </span>
        <span className="truncate font-mono text-[9.5px] text-muted-foreground/60" title={facts.id}>
          {facts.id}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
        {cell("Status", runStatusWord(facts.status), "status")}
        {facts.device
          ? cell(<Explain term="device">Device</Explain>, facts.device, "device")
          : null}
        {facts.lastEpoch != null
          ? cell(
              <Explain term="epochs">Passes</Explain>,
              facts.totalEpochs
                ? `${facts.lastEpoch}/${facts.totalEpochs}`
                : String(facts.lastEpoch),
              "passes",
            )
          : null}
        {duration
          ? cell(<Explain term="duration">Duration</Explain>, duration, "duration")
          : null}
        {metricNames.map((name) => {
          const d = displayMetric(name);
          const stats = facts.metrics[name];
          const best = d.better === "up" ? stats.max : stats.min;
          const label = d.hint ? (
            <Explain info={{ title: d.label, body: d.hint }}>{d.label}</Explain>
          ) : (
            d.label
          );
          return cell(
            label,
            <>
              {d.format(stats.last)}
              <span className="text-muted-foreground/60">
                {" · "}
                <Explain term="best">best</Explain> {d.format(best)}
              </span>
            </>,
            `m-${name}`,
          );
        })}
      </div>
    </div>
  );
}

// ── Generated-text samples (textgen) ──────────────────────────────────────────

function SamplesView() {
  const samples = useMlStore((s) => s.samples);
  const [idx, setIdx] = useState(0);

  // Pin to the newest snapshot as fresh ones stream in.
  useEffect(() => {
    setIdx(Math.max(0, samples.length - 1));
  }, [samples.length]);

  if (samples.length === 0) return null;
  const i = Math.min(idx, samples.length - 1);
  const sample = samples[i];

  return (
    <div className="mb-2 mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Generated text
        </span>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {sample.epoch != null ? (
            <span>after pass {sample.epoch}</span>
          ) : null}
          {samples.length > 1 ? (
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Previous sample"
                disabled={i === 0}
                onClick={() => setIdx(i - 1)}
                className="px-1 leading-none hover:text-foreground disabled:opacity-30"
              >
                ‹
              </button>
              <span className="tabular-nums">
                {i + 1}/{samples.length}
              </span>
              <button
                type="button"
                aria-label="Next sample"
                disabled={i === samples.length - 1}
                onClick={() => setIdx(i + 1)}
                className="px-1 leading-none hover:text-foreground disabled:opacity-30"
              >
                ›
              </button>
            </span>
          ) : null}
        </div>
      </div>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-background/50 px-2 py-1.5 font-mono text-[11px] leading-snug text-foreground/90">
        {sample.text.trim() || "…"}
      </pre>
    </div>
  );
}

// ── Confusion matrix (classification) ─────────────────────────────────────────

function ConfusionMatrixView() {
  const artifact = useMlStore((s) => s.cmArtifact);
  const [cm, setCm] = useState<ConfusionMatrix | null>(null);

  // Read the artifact file whenever the path changes (once per epoch
  // live, or once on historical load). The cancelled flag drops a stale
  // read when the user switches runs mid-flight.
  useEffect(() => {
    if (!artifact) {
      setCm(null);
      return;
    }
    let cancelled = false;
    void readConfusionMatrix(artifact.path)
      .then((d) => {
        if (!cancelled) setCm(d);
      })
      .catch(() => {
        if (!cancelled) setCm(null);
      });
    return () => {
      cancelled = true;
    };
  }, [artifact?.path]);

  if (!cm) return null;
  const { labels, matrix } = cm;
  const k = labels.length;

  let total = 0;
  let correct = 0;
  let max = 0;
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      const v = matrix[r][c];
      total += v;
      if (r === c) correct += v;
      if (v > max) max = v;
    }
  }
  const accuracy = total > 0 ? correct / total : 0;

  // Keep this color math in sync with the HTML report's _confusion_table
  // (nexis-ml/src/nexis_ml/report.py) so the panel and the export agree.
  const cellColor = (v: number, diag: boolean): string | undefined => {
    if (v <= 0) return undefined;
    const alpha = 0.12 + (max > 0 ? v / max : 0) * 0.73;
    // emerald for the correct diagonal, rose for misclassifications
    return `rgba(${diag ? "16,185,129" : "244,63,94"},${alpha.toFixed(3)})`;
  };

  return (
    <div className="mb-2 mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Confusion matrix
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {total > 0 ? (
            <span className="font-mono tabular-nums text-foreground/80">
              {(accuracy * 100).toFixed(1)}% correct
            </span>
          ) : null}
          {artifact?.epoch != null ? <span>after pass {artifact.epoch}</span> : null}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-0.5"
          style={{ gridTemplateColumns: `auto repeat(${k}, 1.6rem)` }}
        >
          {/* header: predicted labels */}
          <div />
          {labels.map((l) => (
            <div
              key={`h-${l}`}
              className="flex h-4 items-center justify-center truncate px-0.5 text-[9.5px] font-medium text-muted-foreground"
              title={`predicted ${l}`}
            >
              {l}
            </div>
          ))}
          {/* one row per actual label */}
          {matrix.map((row, r) => (
            <Fragment key={`r-${labels[r]}`}>
              <div
                className="flex max-w-16 items-center justify-end truncate pr-1 text-[9.5px] font-medium text-muted-foreground"
                title={`actual ${labels[r]}`}
              >
                {labels[r]}
              </div>
              {row.map((v, c) => (
                <div
                  key={`c-${labels[c]}`}
                  className="flex h-6 items-center justify-center rounded-sm font-mono text-[10px] tabular-nums text-foreground/85"
                  style={{ backgroundColor: cellColor(v, r === c) }}
                  title={`actual ${labels[r]} → predicted ${labels[c]}: ${v}`}
                >
                  {v}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[9.5px] leading-snug text-muted-foreground/60">
        Rows are the real answer, columns the model's guess — the green diagonal
        is correct.
      </p>
    </div>
  );
}

// ── Sample-prediction grid (image template) ───────────────────────────────────

function ImageGridView() {
  const artifact = useMlStore((s) => s.imageArtifact);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [artifact?.path]);
  if (!artifact || failed) return null;

  // Same asset:// path handling as the image viewer (convertFileSrc on
  // Windows needs forward slashes). The filename changes each epoch, so
  // the <img> reloads without cache-busting.
  const src = convertFileSrc(artifact.path.replace(/\\/g, "/"));

  return (
    <div className="mb-2 mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Sample predictions
        </span>
        {artifact.epoch != null ? (
          <span className="text-[10px] text-muted-foreground">
            after pass {artifact.epoch}
          </span>
        ) : null}
      </div>
      <img
        src={src}
        alt="Sample predictions"
        onError={() => setFailed(true)}
        className="w-full rounded bg-background/50"
      />
      <p className="mt-1 text-[9.5px] leading-snug text-muted-foreground/60">
        Green border = correct, red = wrong.
      </p>
    </div>
  );
}

// ── Inference playground ──────────────────────────────────────────────────────

function Playground({
  run,
}: {
  run: { projectDir: string; runId: string } | null;
}) {
  const serve = useMlStore((s) => s.serve);
  const startServe = useMlStore((s) => s.startServe);
  const stopServe = useMlStore((s) => s.stopServe);
  const runInference = useMlStore((s) => s.runInference);

  if (!serve && !run) return null;

  const open = () => {
    if (run) void startServe(run.projectDir, run.runId);
  };

  return (
    <div className="mb-2 mt-3 rounded-md border border-border/60 bg-muted/20 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold">
          Playground
          {serve?.status === "ready" && serve.device ? (
            <span
              className={cn(
                "rounded px-1 py-px text-[9px] font-medium",
                serve.device.startsWith("cuda")
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-muted/60 text-muted-foreground",
              )}
              title={`device: ${serve.device}`}
            >
              <DeviceLabel device={serve.device} />
            </span>
          ) : null}
        </span>
        {serve && serve.status !== "stopped" ? (
          <button
            type="button"
            onClick={() => void stopServe()}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        ) : null}
      </div>

      {!serve ? (
        <>
          <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
            Load this trained model and try it live — give it an input, get a
            prediction back.
          </p>
          <button
            type="button"
            onClick={open}
            className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try this model
          </button>
        </>
      ) : serve.status === "starting" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/90">
          <span className="size-1.5 nexis-blink rounded-full bg-sky-500" />
          Loading the model…
        </p>
      ) : serve.status === "error" ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-destructive">
            {serve.error ?? "Couldn't load the model."}
          </p>
          <button
            type="button"
            onClick={open}
            className="self-start rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
          >
            Try again
          </button>
        </div>
      ) : serve.status === "stopped" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">Playground closed.</p>
          {run ? (
            <button
              type="button"
              onClick={open}
              className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              Reopen
            </button>
          ) : null}
        </div>
      ) : serve.template === "tabular" ? (
        <TabularPlayground serve={serve} onPredict={runInference} />
      ) : (
        <TextgenPlayground serve={serve} onGenerate={runInference} />
      )}
    </div>
  );
}

function TextgenPlayground({
  serve,
  onGenerate,
}: {
  serve: ServeSession;
  onGenerate: (request: unknown) => void;
}) {
  const [prompt, setPrompt] = useState("Once upon a time");
  const [temperature, setTemperature] = useState(0.8);
  const result = serve.result?.kind === "text" ? serve.result : null;

  const submit = () =>
    onGenerate({ input: prompt, maxNew: 200, temperature });

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        spellCheck={false}
        aria-label="Prompt text"
        placeholder="Start of the text…"
        className="w-full resize-none rounded border border-border bg-background px-1.5 py-1 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      />
      <div className="flex items-center gap-2">
        <Explain term="temperature">
          <span className="text-[10px] text-muted-foreground">wildness</span>
        </Explain>
        <input
          type="range"
          min={0.2}
          max={1.4}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
          aria-label="Temperature (wildness)"
          className="min-w-0 flex-1 accent-primary"
        />
        <span className="w-6 font-mono text-[10px] tabular-nums text-muted-foreground">
          {temperature.toFixed(1)}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={serve.busy}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {serve.busy ? "Writing…" : "Generate"}
        </button>
      </div>
      {serve.error ? (
        <p className="text-[10px] text-destructive">{serve.error}</p>
      ) : null}
      {result ? (
        <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded bg-background/50 px-2 py-1.5 font-mono text-[11px] leading-snug">
          <span className="text-muted-foreground">{result.input}</span>
          <span className="text-foreground/90">{result.continuation}</span>
        </pre>
      ) : null}
    </div>
  );
}

function TabularPlayground({
  serve,
  onPredict,
}: {
  serve: ServeSession;
  onPredict: (request: unknown) => void;
}) {
  const features = serve.meta?.features ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const result = serve.result?.kind === "tabular" ? serve.result : null;

  const submit = () => {
    const input: Record<string, number> = {};
    for (const f of features) {
      const v = values[f];
      if (v !== undefined && v.trim() !== "" && Number.isFinite(Number(v))) {
        input[f] = Number(v);
      }
    }
    onPredict({ input });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] text-muted-foreground">
        Enter feature values (blanks use the training average):
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {features.map((f) => (
          <label key={f} className="flex items-center gap-1 text-[10px]">
            <span className="w-12 shrink-0 truncate text-muted-foreground" title={f}>
              {f}
            </span>
            <input
              type="number"
              step="any"
              value={values[f] ?? ""}
              onChange={(e) =>
                setValues((s) => ({ ...s, [f]: e.target.value }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 font-mono text-[10px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={serve.busy}
        className="self-start rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {serve.busy ? "Predicting…" : "Predict"}
      </button>
      {serve.error ? (
        <p className="text-[10px] text-destructive">{serve.error}</p>
      ) : null}
      {result ? <TabularResult result={result} /> : null}
    </div>
  );
}

function TabularResult({ result }: { result: Extract<PlaygroundResult, { kind: "tabular" }> }) {
  if (result.label !== undefined) {
    const entries = Object.entries(result.probs ?? {}).sort((a, b) => b[1] - a[1]);
    return (
      <div className="mt-0.5">
        <p className="text-[12px]">
          Prediction:{" "}
          <span className="font-semibold text-foreground">{result.label}</span>
        </p>
        <div className="mt-1 flex flex-col gap-0.5">
          {entries.map(([cls, p]) => (
            <div key={cls} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-8 shrink-0 text-right text-muted-foreground">{cls}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-muted/60">
                <div
                  className="h-full rounded bg-primary/70"
                  style={{ width: `${Math.round(p * 100)}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                {(p * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <p className="mt-0.5 text-[12px]">
      Predicted value:{" "}
      <span className="font-mono font-semibold text-foreground">
        {result.value?.toFixed(4)}
      </span>
    </p>
  );
}

// ── Live progress ─────────────────────────────────────────────────────────────

function ProgressBlock({
  run,
  onCancel,
  onPause,
  onResume,
}: {
  run: ActiveRun;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const seriesTick = useMlStore((s) => s.seriesTick);
  const lastValues = useMlStore((s) => s.lastValues);
  const [, forceTick] = useState(0);

  // 1 Hz repaint for the elapsed timer — only while the run is actually
  // ticking. Unconditional, this re-rendered the whole panel every second
  // even for a finished/paused run left open in the sidebar.
  const timerActive =
    ["starting", "running", "cancelling"].includes(run.status) && !run.paused;
  useEffect(() => {
    if (!timerActive) return;
    const t = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [timerActive]);

  const names = Object.keys(lastValues);
  const hero = headlineMetric(names);
  const heroDisplay = hero ? displayMetric(hero) : null;
  // seriesTick dependency keeps the trend fresh as batches arrive.
  void seriesTick;
  const trend = hero
    ? trendOf(getSeriesMap().get(hero), heroDisplay?.better ?? "down")
    : "steady";

  const pct = run.totalEpochs
    ? Math.min(100, Math.round((run.epoch / run.totalEpochs) * 100))
    : null;
  const sentence = statusSentence({
    phase: run.status,
    epoch: run.epoch,
    totalEpochs: run.totalEpochs,
    headlineName: hero,
    headlineValue: hero ? lastValues[hero] : undefined,
    trend,
  });

  return (
    <div className="mb-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold">
          <span className="size-1.5 nexis-blink rounded-full bg-emerald-500" />
          Training
          {run.device ? (
            <span
              className={cn(
                "rounded px-1 py-px text-[9px] font-medium",
                run.device.startsWith("cuda")
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-muted/60 text-muted-foreground",
              )}
              title={`device: ${run.device}`}
            >
              <DeviceLabel device={run.device} />
            </span>
          ) : null}
          {run.paused ? (
            <span className="rounded bg-amber-500/10 px-1 py-px text-[9px] font-medium text-amber-500">
              paused
            </span>
          ) : null}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatElapsed(Date.now() - run.startedAtMs)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn(
            "h-full rounded-full bg-emerald-500/80 transition-[width] duration-500",
            pct === null && "w-1/4 animate-pulse",
          )}
          style={pct !== null ? { width: `${Math.max(pct, 3)}%` } : undefined}
        />
      </div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <Explain term="epochs">
          <span>
            {run.totalEpochs
              ? `pass ${run.epoch}/${run.totalEpochs} through the data`
              : `pass ${run.epoch}`}
          </span>
        </Explain>
        {pct !== null ? <span className="font-mono tabular-nums">{pct}%</span> : null}
      </div>

      <p className="mb-1.5 text-[11px] leading-snug text-foreground/90">
        {run.paused ? "Paused — will resume at your command." : sentence}
      </p>

      <div className="flex items-center gap-1.5">
        {run.status === "running" ? (
          <button
            type="button"
            onClick={run.paused ? onResume : onPause}
            className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {run.paused ? "Resume" : "Pause"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          {run.status === "cancelling" ? "Force stop" : "Stop (keeps progress)"}
        </button>
      </div>
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function bestOf(summary: RunSummary | null, name: string): number | null {
  const stats = summary?.metrics?.[name];
  if (!stats) return null;
  return displayMetric(name).better === "up" ? stats.max : stats.min;
}

function ResultCard({
  run,
  summary,
  onTrainAgain,
}: {
  run: ActiveRun;
  summary: RunSummary | null;
  onTrainAgain: () => void;
}) {
  const tone =
    run.status === "ok"
      ? "border-emerald-500/40 bg-emerald-500/[0.06]"
      : run.status === "cancelled"
        ? "border-amber-500/40 bg-amber-500/[0.06]"
        : "border-red-500/40 bg-red-500/[0.06]";
  const title =
    run.status === "ok"
      ? "Training complete"
      : run.status === "cancelled"
        ? "Stopped early — progress saved"
        : "Training failed";

  const metricNames = Object.keys(summary?.metrics ?? {});
  const hero = headlineMetric(metricNames);
  const chips: string[] = [];
  if (hero) {
    const best = bestOf(summary, hero);
    if (best !== null) {
      const d = displayMetric(hero);
      chips.push(`Best ${d.label.toLowerCase()}: ${d.format(best)}`);
    }
  }
  if (summary?.lastEpoch) chips.push(`${summary.lastEpoch} passes`);
  if (summary?.device?.startsWith("cuda")) chips.push("trained on GPU");

  return (
    <div className={cn("mb-2 rounded-md border p-2.5", tone)}>
      <p className="mb-1 text-[12px] font-semibold">{title}</p>
      {chips.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded bg-background/60 px-1.5 py-0.5 text-[10.5px] text-foreground/90"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}
      {run.status === "error" ? (
        <p className="mb-1.5 text-[11px] text-muted-foreground">
          Open Details below for the full output.
        </p>
      ) : (
        <p className="mb-1.5 text-[11px] text-muted-foreground">
          The model was saved — its checkpoint lives in the project's run
          folder.
        </p>
      )}
      <button
        type="button"
        onClick={onTrainAgain}
        className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        ▶ Train again
      </button>
    </div>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

function EngineChip({
  status,
  version,
  kind,
  envInfo,
}: {
  status: string;
  version: string | null;
  kind: EngineKind | null;
  envInfo: MlEnvInfo | null;
}) {
  const dot =
    status === "ready"
      ? "bg-emerald-500"
      : status === "missing"
        ? "bg-red-500/80"
        : "bg-muted-foreground/50";
  // Which engine is answering, not just that one exists: the standalone
  // Rust/burn binary and the Python/PyTorch package share the name
  // `nexis-ml` but have different capability sets.
  const kindLabel =
    kind === "rust" ? "Rust engine" : kind === "python" ? "Python engine" : "engine";
  const label =
    status === "ready"
      ? `${kindLabel} ${version ?? ""}`
      : status === "missing"
        ? "setup needed"
        : "checking…";
  const detail =
    status !== "ready"
      ? undefined
      : kind === "rust"
        ? `Standalone Rust engine (burn) · backend: ${envInfo?.backend ?? "?"}`
        : kind === "python"
          ? `Python engine (PyTorch${envInfo?.torch ? ` ${envInfo.torch}` : ""})`
          : "Engine detected — probing capabilities…";
  return (
    <span
      className="flex items-center gap-1 rounded bg-muted/40 px-1.5 py-px text-[10px] text-muted-foreground"
      title={detail}
    >
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function LogView({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);
  return (
    <div
      ref={ref}
      className="mt-1 max-h-32 overflow-y-auto rounded bg-muted/30 px-1.5 py-1 font-mono text-[10px] leading-4 text-muted-foreground"
    >
      {logs.map((line, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="whitespace-pre-wrap break-all">
          {line}
        </div>
      ))}
    </div>
  );
}

/** "2026-06-12-1009-tabular" → "tabular · 10:09" */
function friendlyRunName(id: string): string {
  const m = /^\d{4}-\d{2}-\d{2}-(\d{2})(\d{2})-(.+?)(-\d+)?$/.exec(id);
  if (!m) return id;
  return `${m[3]} · ${m[1]}:${m[2]}`;
}

function RunRow({
  run,
  selected,
  comparing,
  compareColor,
  disabled,
  onClick,
  onToggleCompare,
  onSaveMeta,
}: {
  run: HistoricalRun;
  selected: boolean;
  comparing: boolean;
  compareColor?: string;
  disabled: boolean;
  onClick: () => void;
  onToggleCompare: () => void;
  onSaveMeta: (patch: { note?: string; tags?: string[]; pinned?: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(run.note ?? "");
  const [tags, setTags] = useState(() => (run.tags ?? []).join(", "));

  useEffect(() => {
    if (editing) {
      setNote(run.note ?? "");
      setTags((run.tags ?? []).join(", "));
    }
  }, [editing, run.note, run.tags]);

  const dot =
    run.status === "ok"
      ? "bg-emerald-500"
      : run.status === "error"
        ? "bg-red-500/80"
        : run.status === "cancelled"
          ? "bg-amber-500/80"
          : "bg-muted-foreground/40";

  const metricNames = Object.keys(run.metrics ?? {});
  const hero = headlineMetric(metricNames);
  let metric: string | null = null;
  if (hero && run.metrics) {
    const stats = run.metrics[hero];
    if (stats && typeof stats.last === "number") {
      const d = displayMetric(hero);
      metric = `${d.label.toLowerCase()} ${d.format(stats.last)}`;
    }
  }

  const hasMeta = Boolean(run.note?.trim()) || (run.tags?.length ?? 0) > 0;
  const saveMeta = () => {
    onSaveMeta({
      note: note.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setEditing(false);
  };

  // A checkbox can't live inside a <button>, so the row is a flex
  // container: checkbox toggles compare, the button loads the single view.
  return (
    <div
      className={cn(
        "rounded transition-colors",
        selected ? "bg-primary/[0.08]" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={comparing}
          onChange={onToggleCompare}
          aria-label={`Compare ${friendlyRunName(run.id)}`}
          title="Compare this run"
          className="ml-1 size-3 shrink-0 accent-primary"
          style={comparing && compareColor ? { accentColor: compareColor } : undefined}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left",
            disabled && "cursor-default opacity-60",
          )}
          title={`${run.id} — ${runStatusWord(run.status)}`}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-foreground/85">
            {friendlyRunName(run.id)}
            <span className="text-muted-foreground/60">
              {" "}
              · {runStatusWord(run.status)}
            </span>
          </span>
          {metric ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {metric}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onSaveMeta({ pinned: !run.pinned })}
          aria-label={run.pinned ? "Unpin run" : "Pin as baseline"}
          title={run.pinned ? "Unpin" : "Pin as baseline"}
          className={cn(
            "shrink-0 px-1 leading-none",
            run.pinned
              ? "text-amber-500"
              : "text-muted-foreground/40 hover:text-foreground",
          )}
        >
          <Icon name="pin" size="xs" active={run.pinned} />
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label="Notes and tags"
          title="Notes & tags"
          className="mr-1 shrink-0 px-0.5 leading-none text-muted-foreground/50 hover:text-foreground"
        >
          <Icon name="edit" size="xs" />
        </button>
      </div>

      {!editing && hasMeta ? (
        <div className="flex flex-col gap-0.5 px-2 pb-1 pl-6">
          {run.tags?.length ? (
            <div className="flex flex-wrap gap-1">
              {run.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {run.note?.trim() ? (
            <p className="truncate text-[10px] text-muted-foreground/70" title={run.note}>
              {run.note}
            </p>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-1 px-2 pb-2 pl-6">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note for this run"
            placeholder="Note for this run…"
            rows={2}
            spellCheck={false}
            className="w-full resize-none rounded border border-border bg-background px-1.5 py-1 text-[10.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-label="Tags, comma separated"
            placeholder="tags, comma, separated"
            spellCheck={false}
            className="h-6 rounded border border-border bg-background px-1.5 text-[10.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={saveMeta}
              className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Run comparison ────────────────────────────────────────────────────────────

function ComparisonView({
  runs,
  onClear,
}: {
  runs: CompareRun[];
  onClear: () => void;
}) {
  // The layout (metric union + legend) derives only from the selected
  // runs; each CompareChart subscribes to seriesTick itself for its redraw,
  // so this component needn't recompute on every batch.
  const { ordered, lines } = useMemo(() => {
    const metricSet = new Set<string>();
    for (const r of runs) for (const m of r.metrics) metricSet.add(m);
    const metricNames = [...metricSet];
    const hero = headlineMetric(metricNames);
    return {
      ordered: hero ? [hero, ...metricNames.filter((m) => m !== hero)] : metricNames,
      lines: runs.map((r) => ({ id: r.id, color: r.color })),
    };
  }, [runs]);

  return (
    <div className="mb-2 mt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold">
          Comparing {runs.length} runs
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
        {runs.map((r) => (
          <span
            key={r.id}
            className="flex items-center gap-1 text-[10px] text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ backgroundColor: r.color }}
            />
            {friendlyRunName(r.id)}
          </span>
        ))}
      </div>
      {ordered.length > 0 ? (
        <div className="flex flex-col gap-2">
          {ordered.map((m) => (
            <CompareChart key={m} metric={m} runs={lines} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">
          These runs have no metrics to chart.
        </p>
      )}
    </div>
  );
}

// ── Hyperparameter form ───────────────────────────────────────────────────────
// Field list + display/TOML conversions live in lib/hyperparams.ts (pure,
// unit-tested); glossary.test.ts guarantees each field has a hover card.

function HyperparamForm({
  projectDir,
  onSaveTrain,
}: {
  projectDir: string;
  onSaveTrain: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [fields, setFields] = useState<HpField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load train.toml the first time the section is expanded (and reload
  // if reopened, so external edits are picked up).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus(null);
    void readTrainToml(projectDir).then((t) => {
      if (cancelled) return;
      if (t == null) {
        setText(null);
        setFields([]);
        return;
      }
      const present = HP_FIELDS.filter((f) => tomlGet(t, f.section, f.key) !== null);
      const vals: Record<string, string> = {};
      for (const f of present) {
        vals[fieldId(f)] = rawToDisplay(f.type, tomlGet(t, f.section, f.key) as string);
      }
      setText(t);
      setFields(present);
      setValues(vals);
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectDir]);

  const save = async (thenTrain: boolean) => {
    if (text == null) return;
    let next = text;
    for (const f of fields) {
      const raw = displayToRaw(f.type, values[fieldId(f)] ?? "");
      if (raw == null) {
        setStatus(`Check "${f.label}"`);
        return;
      }
      next = tomlSet(next, f.section, f.key, raw);
    }
    setSaving(true);
    try {
      await writeTrainToml(projectDir, next);
      setText(next);
      setStatus("Saved");
      if (thenTrain) onSaveTrain();
    } catch (e) {
      setStatus(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <details
      className="mb-2 rounded-md border border-border/60 bg-muted/20"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-semibold text-foreground/90">
        Hyperparameters
      </summary>
      <div className="px-2.5 pb-2.5">
        {text == null ? (
          <p className="text-[11px] text-muted-foreground">
            No train.toml in this project.
          </p>
        ) : fields.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No editable settings found.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              {fields.map((f) => (
                <label
                  key={fieldId(f)}
                  className="flex flex-col gap-0.5 text-[10px] text-muted-foreground"
                >
                  <Explain term={f.key}>
                    <span className="truncate" title={`[${f.section}] ${f.key}`}>
                      {f.label}
                    </span>
                  </Explain>
                  {f.type === "enum" ? (
                    <select
                      value={values[fieldId(f)] ?? ""}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, [fieldId(f)]: e.target.value }))
                      }
                      className="h-6 rounded border border-border bg-background px-1 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                    >
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={values[fieldId(f)] ?? ""}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, [fieldId(f)]: e.target.value }))
                      }
                      spellCheck={false}
                      className="h-6 rounded border border-border bg-background px-1 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
                className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className="rounded-md bg-primary px-2.5 py-0.5 text-[10.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save &amp; train
              </button>
              {status ? (
                <span className="text-[10px] text-muted-foreground">{status}</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
