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
import { TOOL_NAMES } from "@/lib/toolNames";
import { MlLinks } from "./MlLinks";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { IS_WINDOWS } from "@/lib/platform";
import { assetUrl } from "@/platform/desktop";
import { cn } from "@/lib/utils";
import {
  useMlStore,
  getSeriesMap,
  initMlSubscriptions,
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
import type { MetricStats, RunSummary, ServeColumn } from "./lib/protocol";
import {
  engineSupportsTemplate,
  versionOlder,
  type EngineKind,
  type EnginePin,
  type MlEnvInfo,
  type MlTemplate,
} from "./lib/engine-bridge";
import { revealPathInHost } from "@/platform/opener";
import {
  readConfusionMatrix,
  readResiduals,
  type ConfusionMatrix,
  type Residuals,
} from "./lib/artifacts";
import { readTrainToml, writeTrainToml } from "./lib/config";
import {
  torchSupportWarning,
  TORCH_MAX_MINOR,
  TORCH_MIN_MINOR,
} from "./lib/pythonSupport";
import { tomlGet, tomlSet } from "./lib/toml-edit";
import { applyOverrides, type ModelScale } from "./lib/model-blueprint";
import {
  dataOverrides,
  guessTarget,
  listWorkspaceCsvs,
  relativeDataPath,
  summarizeColumns,
  summarizeCsv,
  summarizeTarget,
  type Task,
} from "./lib/data-source";
import { parseDataConfig, parseTomlNet } from "./lib/netspec";
import { readTextFile } from "./lib/fs";
import {
  STOCK_MODELS,
  planCreation,
  stockBrief,
  stockModel,
  type StockFamily,
  type StockModel,
} from "./lib/stock-models";
import { STARTER_DATASETS } from "./lib/starter-data";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setMlAutoOpenOnTrain } from "@/modules/settings/store";
import {
  useWorkspaceEnvStore,
  workspaceScopeKey,
} from "@/platform/workspaces";

/** Release feed for the standalone (Rust) engine — the WSL steps fetch the
 *  Linux build from here. The in-app download uses the Rust-side pin, not
 *  this URL; this is only what a human types into curl. */
const ENGINE_RELEASES_URL = "https://github.com/rwetz/axon/releases";
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

/** Gallery tabs over the stock networks. */
const STOCK_TABS: { id: "starter" | StockFamily; label: string }[] = [
  { id: "starter", label: "Starters" },
  { id: "tabular", label: "Spreadsheet nets" },
  { id: "image", label: "Image nets" },
  { id: "textgen", label: "Text nets" },
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
  // The ML Lab tool window has no plugin host, so the panel subscribes
  // itself; in the main window this shares the plugin's listeners.
  useEffect(() => initMlSubscriptions(), []);

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

  // What the body is showing; a change of phase (folder opened, engine
  // found, setup finished) plays the view entrance, the way Epoch's pages do.
  const phase = !workspaceRoot
    ? "no-folder"
    : engineStatus === "missing"
      ? "setup"
      : engineStatus === "detecting" || engineStatus === "idle"
        ? "detecting"
        : "ready";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide">{TOOL_NAMES.mlLab}</span>
          <EngineChip
            status={engineStatus}
            version={engineVersion}
            kind={engineKind}
            envInfo={envInfo}
          />
          {engineStatus === "ready" &&
          (envInfo?.cudaAvailable || envInfo?.backend === "wgpu") ? (
            <span
              className="flex items-center gap-1 rounded bg-success/10 px-1.5 py-px text-[10px] text-success"
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
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-label="Refresh"
          onClick={() => {
            if (workspaceRoot) {
              void refreshProjects(workspaceRoot);
              if (selectedProject) void refreshRuns(selectedProject);
            }
          }}
          className="text-muted-foreground"
        >
          <Icon name="refresh" size="xs" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        <div key={phase} className="nexis-view-enter">
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
              {/* A newer pinned Axon than the one in use (an older managed
                  install, or one on PATH). */}
              {engineKind === "rust" &&
              enginePin &&
              engineVersion &&
              versionOlder(engineVersion, enginePin.version) ? (
                <div className="mb-2 flex items-center gap-2 rounded-md border border-info/30 bg-info/[0.05] px-2.5 py-1.5">
                  <p className="flex-1 text-[10.5px] leading-snug text-muted-foreground">
                    Axon {enginePin.version} is available (you have {engineVersion}). It can
                    predict numbers, read text columns as categories, and handle blank cells.
                  </p>
                  <Button
                    size="xs"
                    type="button"
                    disabled={downloadingEngine}
                    onClick={() => void downloadStandaloneEngine()}
                    className="shrink-0"
                  >
                    {downloadingEngine ? "Updating…" : "Update"}
                  </Button>
                </div>
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
                            void revealPathInHost(`${selectedProject}/model.onnx`).catch(
                              () => {},
                            )
                          }
                          className="h-6 shrink-0 rounded border border-info/40 bg-info/[0.06] px-1.5 text-[10px] font-medium text-info"
                          title="model.onnx — click to reveal"
                        >
                          ONNX
                        </button>
                      </Explain>
                    ) : null}
                    <Button
                      variant="outline"
                      size="xs"
                      type="button"
                      onClick={() => setShowCreate(true)}
                      disabled={busy}
                      className="shrink-0"
                      title="Create a new model"
                    >
                      <Icon name="add" size="xs" />
                      New
                    </Button>
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
                    here (or by <span className="font-mono">axon</span> in a
                    terminal) show up automatically.
                  </p>
                  <Button
                    variant="outline"
                    size="xs"
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="mt-1.5"
                  >
                    New model…
                  </Button>
                </div>
              ) : null}
              {showCreate || pendingCreate ? (
                <CreateCard
                  creating={pendingCreate != null}
                  createError={createError}
                  engineKind={engineKind}
                  onCreate={(template, name, autoTrain, purpose, scale, stockId) => {
                    setShowCreate(false);
                    const stock = stockId ? stockModel(stockId) ?? null : null;
                    void createProject(
                      workspaceRoot,
                      template,
                      name,
                      autoTrain,
                      stock ? stockBrief(stock, purpose) : purpose,
                      planCreation(template, scale, stock),
                      stock?.dataset ? STARTER_DATASETS[stock.dataset].build() : [],
                    );
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
                <Button
                  variant="brand"
                  size="sm"
                  type="button"
                  onClick={() => void startTrain(selectedProject)}
                  className="mb-2 w-full"
                >
                  <Icon name="play" size="xs" />
                  Train model
                </Button>
              ) : null}

              {/* Training data — choose [data] path + target without editing train.toml */}
              {selectedProject && !busy && !pendingCreate && projects.length > 0 ? (
                <DataSourceForm
                  key={`data-${selectedProject}`}
                  workspaceRoot={workspaceRoot}
                  projectDir={selectedProject}
                  onSaveTrain={() => void startTrain(selectedProject)}
                />
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
                    <div
                      key={chartSource?.kind === "historical" ? chartSource.runId : "live"}
                      className="nexis-content-enter mb-2 mt-2 flex flex-col gap-2"
                    >
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

                  {/* Predicted vs actual (regression) — per-epoch scatter */}
                  <ResidualsView />

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
                      <Button
                        variant="outline"
                        size="xs"
                        type="button"
                        disabled={pendingExport != null}
                        onClick={() =>
                          void exportReport(viewedRun.projectDir, viewedRun.runId)
                        }
                      >
                        <Icon name="download" size="xs" />
                        {pendingExport ? "Exporting…" : "Export HTML report"}
                      </Button>
                    ) : null}
                    {selectedProject && engineKind === "rust" ? (
                      <Explain term="onnx">
                        <Button
                          variant="outline"
                          size="xs"
                          type="button"
                          disabled={pendingOnnx != null || busy}
                          onClick={() =>
                            void exportOnnx(
                              selectedProject,
                              viewedRun?.projectDir === selectedProject ? viewedRun.runId : null,
                            )
                          }
                        >
                          <Icon name="download" size="xs" />
                          {pendingOnnx ? "Exporting ONNX…" : "Export ONNX model"}
                        </Button>
                      </Explain>
                    ) : null}
                    {selectedProject ? (
                      <MlLinks
                        projectDir={selectedProject}
                        runId={viewedRun?.runId ?? null}
                        hasOnnx={projects.find((p) => p.dir === selectedProject)?.hasOnnx ?? false}
                      />
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
                  <Button
                    variant="outline"
                    size="xs"
                    type="button"
                    disabled={
                      busy || downloadingEngine || installing || uninstallingEngine
                    }
                    onClick={() => void uninstallManagedEngine(workspaceRoot)}
                    title="Deletes the downloaded engine binary and frees the disk space. Engines installed in a venv or on PATH are unaffected; you can re-download any time."
                    className="hover:border-destructive/40 hover:text-destructive"
                  >
                    {uninstallingEngine ? "Removing…" : "Remove"}
                  </Button>
                </div>
              ) : null}
              {/* Engine errors used to be rendered only by SetupCard, which is
                  gone once an engine is detected — so a failed uninstall (or any
                  other post-setup engine failure) was swallowed and the click
                  looked like it had done nothing at all. */}
              {engineError ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-snug text-destructive">
                  <Icon name="alert-circle" size="xs" className="mt-px shrink-0" />
                  <span>{engineError}</span>
                </p>
              ) : null}
            </>
          )}
        </div>
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
    <div className="nexis-scene-enter rounded-md border border-border/60 bg-muted/20 p-2.5">
      <p className="mb-1 text-[12px] font-semibold">Set up the ML engine</p>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        Nexis trains models with Axon, a small local engine. Everything runs
        on your machine — no cloud, no accounts.
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
            <span className="size-1.5 nexis-blink rounded-full bg-info" />
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
            Download Axon {pin.version}?
          </p>
          <dl className="mb-1.5 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            <div className="flex gap-1">
              <dt className="shrink-0 text-muted-foreground/60">From</dt>
              <dd className="min-w-0 truncate font-mono" title={pin.url}>
                github.com/rwetz/axon · {pinAsset}
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
            can run. This is the only thing {TOOL_NAMES.mlLab} ever downloads.
          </p>
          <div className="flex gap-1.5">
            <Button
              size="xs"
              type="button"
              onClick={() => {
                setConfirmingDownload(false);
                onDownloadEngine();
              }}
              className="flex-1"
            >
              Download &amp; verify
            </Button>
            <Button
              variant="outline"
              size="xs"
              type="button"
              onClick={() => setConfirmingDownload(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button
            variant="brand"
            size="sm"
            type="button"
            onClick={() =>
              // No pin = no prebuilt for this platform; let the store surface
              // its "not available" error instead of consenting to nothing.
              pin ? setConfirmingDownload(true) : onDownloadEngine()
            }
            className="mb-1.5 w-full"
          >
            Download engine{pinMb ? ` (~${pinMb} MB)` : ""}
          </Button>
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            One verified binary from the project&apos;s GitHub releases. No
            Python, no PyTorch, nothing else to install. Trains spreadsheet
            models (categories or numbers) and image models
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
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  disabled={!localPath.trim()}
                  onClick={() => onInstallLocal(localPath)}
                >
                  Verify &amp; install
                </Button>
              </div>
            </details>
          ) : null}
        </>
      )}

      {error && !downloadingEngine ? (
        <div className="mt-1.5">
          <p className="text-[10.5px] leading-snug text-destructive">{error}</p>
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
      <CopyLine command={`mkdir -p ~/.local/bin && curl -fL -o ~/.local/bin/axon ${ENGINE_RELEASES_URL}/latest/download/axon-linux-x64`} />
      <CopyLine command="chmod +x ~/.local/bin/axon" />
      <CopyLine command="axon --version" />
      <p className="text-[10px] leading-snug text-muted-foreground/70">
        If the last command prints a version, hit “check again” below.{" "}
        <span className="font-mono">~/.local/bin</span> is on the default PATH
        for most distros — if <span className="font-mono">axon</span> is
        not found, open a fresh terminal or add it to your shell profile.
      </p>
    </div>
  );
}

/**
 * The legacy Python engine, as documentation rather than a button. It is
 * phased out — Axon is the supported engine — and stays here only for the
 * few things Axon cannot do yet.
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
        Need text generation? The legacy Python engine
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5">
        <p className="text-[10.5px] leading-snug text-muted-foreground">
          The Python engine is phased out and no longer maintained; Axon
          above is the supported engine. It still covers three things Axon
          cannot do yet: <strong>text generation</strong> (the{" "}
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
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-warning">
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
    <div className="mb-2 rounded-md border border-success/30 bg-success/[0.05] p-2">
      {installing ? (
        <>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] text-foreground/90">
            <span className="size-1.5 nexis-blink rounded-full bg-success" />
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
          <Button
            variant="outline"
            size="xs"
            type="button"
            onClick={onUpgrade}
            className="shrink-0 border-success/40 text-success hover:bg-success/10 hover:text-success"
          >
            Enable GPU
          </Button>
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
      <Button
        variant="outline"
        size="xs"
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(command);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0"
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

// ── Project creation ──────────────────────────────────────────────────────────

/** Exported for its test; the panel is the only caller. */
export function CreateCard({
  creating,
  createError,
  engineKind,
  onCreate,
  onDismiss,
}: {
  creating: boolean;
  createError: string | null;
  engineKind: EngineKind | null;
  onCreate: (
    template: MlTemplate,
    name: string,
    autoTrain: boolean,
    purpose: string,
    scale: ModelScale,
    stockId: string | null,
  ) => void;
  onDismiss?: () => void;
}) {
  const [chosen, setTemplate] = useState<MlTemplate>("tabular");
  const [name, setName] = useState(TEMPLATE_OPTIONS[0].defaultName);
  const [autoTrain, setAutoTrain] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [scale, setScale] = useState<ModelScale>("starter");
  const [stockId, setStockId] = useState<string | null>(null);
  const [stockTab, setStockTab] = useState<(typeof STOCK_TABS)[number]["id"]>("starter");

  // If the active engine can't scaffold the chosen template (e.g. the
  // standalone Rust engine resolved after the card mounted), show and create
  // the first one it can, so the Create button never starts a doomed run.
  // Derived during render rather than synced by an effect, so no frame ever
  // shows the unsupported choice.
  const fallback = engineSupportsTemplate(chosen, engineKind)
    ? null
    : (TEMPLATE_OPTIONS.find((o) => engineSupportsTemplate(o.id, engineKind)) ?? null);
  const template = fallback?.id ?? chosen;
  const stock = !fallback && stockId ? (stockModel(stockId) ?? null) : null;

  // Switching template swaps in its suggested name (the user can still
  // rename); keeps "tiny-writer" from sticking on a tabular project.
  const pick = (id: MlTemplate) => {
    setTemplate(id);
    setStockId(null);
    setName(TEMPLATE_OPTIONS.find((o) => o.id === id)?.defaultName ?? name);
  };

  // Show only templates the active engine can actually scaffold. The Rust
  // engine is config-only, so textgen and the code-it-yourself `blank`
  // project (both hinge on a hand-editable train.py) are hidden while it's
  // active — you only ever see options that will work. An unknown engine
  // kind (probe still pending) shows everything; the engine validates too.
  const templateOptions = TEMPLATE_OPTIONS.filter((o) =>
    engineSupportsTemplate(o.id, engineKind),
  );

  const pickStock = (m: StockModel) => {
    setTemplate(m.family);
    setStockId(m.id);
    setName(m.name);
    setPurpose(m.purpose);
  };
  const create = () => onCreate(template, name, autoTrain, purpose, scale, stock?.id ?? null);

  // Only networks the active engine can train (the standalone engine has no
  // text template), filtered to the open tab.
  const stockShown = STOCK_MODELS.filter(
    (m) =>
      engineSupportsTemplate(m.family, engineKind) &&
      (stockTab === "starter" ? m.group === "starter" : m.group === "architecture" && m.family === stockTab),
  );
  const tabs = STOCK_TABS.filter((t) => t.id === "starter" || engineSupportsTemplate(t.id, engineKind));

  return (
    <div className="nexis-scene-enter mb-3 rounded-xl border border-primary/25 bg-primary/[0.035] p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Build a model</p>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-snug text-muted-foreground">
            Choose a job, tune the starting configuration, then create an editable project.
          </p>
        </div>
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <section className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">1. Pick a stock network</p>
          <div role="tablist" aria-label="Stock networks" className="mt-2 flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={stockTab === t.id}
                onClick={() => setStockTab(t.id)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  stockTab === t.id
                    ? "border-primary/50 bg-primary/[0.10] text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {stockShown.map((m) => {
              const selected = m.id === stock?.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={creating}
                  aria-pressed={selected}
                  onClick={() => pickStock(m)}
                  className={cn(
                    "rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                    selected
                      ? "border-primary/50 bg-primary/[0.07]"
                      : "border-border bg-background/50 hover:border-primary/30 hover:bg-primary/[0.04]",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold text-foreground/90">{m.label}</span>
                    {m.dataset ? (
                      <span className="shrink-0 rounded bg-success/10 px-1 text-[9px] text-success">
                        data included
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[9.5px] text-muted-foreground/80">{m.shape}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{m.blurb}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Or choose the model family</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {templateOptions.map((opt) => {
          const selected = opt.id === template;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={creating}
              onClick={() => pick(opt.id)}
              className={cn(
                "min-h-20 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-primary/50 bg-primary/[0.07]"
                  : "border-border hover:bg-foreground/[0.04]",
              )}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/90">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    selected ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
                {opt.label}
              </span>
              <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">
                {opt.desc}
              </span>
            </button>
          );
        })}
          </div>

      {/* Factual note when the standalone engine hides templates. */}
      {templateOptions.length < TEMPLATE_OPTIONS.length ? (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground/70">
          Text generation and the code-your-own Blank project need the Python
          engine — the standalone engine is config-driven.
        </p>
      ) : null}
        </section>

        <section className="rounded-lg border border-border/70 bg-background/45 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">2. Configure it</p>
      {creating ? (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/90">
          <span className="size-1.5 nexis-blink rounded-full bg-info" />
          Creating project…
        </p>
      ) : (
        <>
          <label className="mt-2 block text-[10px] text-muted-foreground">
            Project name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) create();
              }}
              aria-label="New project name"
              spellCheck={false}
              className="mt-1 h-8 w-full rounded border border-border bg-background px-2 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            />
          </label>
          <fieldset className="mt-3">
            <legend className="text-[10px] text-muted-foreground">Starting configuration</legend>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(["starter", "balanced", "ambitious"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={scale === option}
                  onClick={() => setScale(option)}
                  className={cn(
                    "rounded-md border px-1 py-2 text-[10px] font-medium capitalize transition-colors",
                    scale === option ? "border-primary/50 bg-primary/[0.10] text-primary" : "border-border bg-background/50 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            {stock ? (
              <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                {stock.label} sets the network ({stock.shape}); the size here sets the training budget.
                {stock.dataset
                  ? ` Writes synthetic starter data to ${STARTER_DATASETS[stock.dataset].path}, so it can train right away.`
                  : ""}
              </p>
            ) : template === "textgen" ? (
              <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                This creates a local GPT-style character model. Size controls context, width, heads, layers, and training defaults; you can edit every value before training.
              </p>
            ) : (
              <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                Sets a sensible training budget now; all values remain editable in the hyperparameters form.
              </p>
            )}
          </fieldset>
          <label className="mt-3 block text-[10px] text-muted-foreground">
            What should this model help with? <span className="text-muted-foreground/60">Optional, saved in PROJECT.md.</span>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="For example: flag invoices that need a human review"
              rows={2}
              className="mt-1 w-full resize-y rounded border border-border bg-background px-1.5 py-1 text-[10.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            />
          </label>
          <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={autoTrain}
              onChange={(e) => setAutoTrain(e.target.checked)}
              className="size-3 accent-primary"
            />
            Start training right away (otherwise review the hyperparameters
            first)
          </label>
          <Button
            variant="brand"
            size="sm"
            type="button"
            disabled={!name.trim()}
            onClick={create}
            className="mt-3 w-full"
          >
            Create {stock ? stock.label : template === "textgen" ? "GPT-style model" : "model"}
          </Button>
        </>
      )}
      {createError && !creating ? (
        <p className="mt-1.5 text-[10.5px] leading-snug text-destructive">
          {createError}
        </p>
      ) : null}
        </section>
      </div>
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

// ── Residuals (regression) ────────────────────────────────────────────────────

/** Compact number for axis/readout labels: 1234567 → "1.23M", 0.01234 → "0.0123". */
function shortNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  if (a >= 100) return v.toFixed(0);
  return Number(v.toPrecision(3)).toString();
}

function ResidualsView() {
  const artifact = useMlStore((s) => s.residualsArtifact);
  const [data, setData] = useState<Residuals | null>(null);

  // Same read-on-path-change + stale-read guard as ConfusionMatrixView.
  useEffect(() => {
    if (!artifact) {
      setData(null);
      return;
    }
    let cancelled = false;
    void readResiduals(artifact.path)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [artifact?.path]);

  if (!data) return null;
  const { actual, predicted } = data;
  let lo = Infinity;
  let hi = -Infinity;
  let absErr = 0;
  for (let i = 0; i < actual.length; i++) {
    lo = Math.min(lo, actual[i], predicted[i]);
    hi = Math.max(hi, actual[i], predicted[i]);
    absErr += Math.abs(predicted[i] - actual[i]);
  }
  const span = hi - lo || 1;
  const size = 160;
  const pad = 6;
  const px = (v: number) => pad + ((v - lo) / span) * (size - 2 * pad);
  const py = (v: number) => size - px(v);

  return (
    <div className="mb-2 mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Predicted vs actual{data.target ? ` · ${data.target}` : ""}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground/80">
            off by {shortNum(absErr / actual.length)} on average
          </span>
          {artifact?.epoch != null ? <span>after pass {artifact.epoch}</span> : null}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-40 w-40 shrink-0 rounded-sm bg-background/60"
          role="img"
          aria-label={`Predicted versus actual for ${actual.length} validation rows`}
        >
          {/* The diagonal is a perfect prediction. */}
          <line
            x1={px(lo)}
            y1={py(lo)}
            x2={px(hi)}
            y2={py(hi)}
            className="stroke-success/60"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {actual.map((a, i) => (
            <circle key={i} cx={px(a)} cy={py(predicted[i])} r={1.8} className="fill-primary/60" />
          ))}
        </svg>
        <div className="flex flex-col gap-0.5 text-[9.5px] text-muted-foreground">
          <span>
            range {shortNum(lo)} – {shortNum(hi)}
          </span>
          <span>{actual.length} validation rows</span>
        </div>
      </div>
      <p className="mt-1 text-[9.5px] leading-snug text-muted-foreground/60">
        Across is the real value, up is the model's guess — dots on the dashed
        line are exact.
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
  const src = assetUrl(artifact.path.replace(/\\/g, "/"));

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
                  ? "bg-success/10 text-success"
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
          <Button
            size="xs"
            type="button"
            onClick={open}
          >
            Try this model
          </Button>
        </>
      ) : serve.status === "starting" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/90">
          <span className="size-1.5 nexis-blink rounded-full bg-info" />
          Loading the model…
        </p>
      ) : serve.status === "error" ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-destructive">
            {serve.error ?? "Couldn't load the model."}
          </p>
          <Button
            variant="outline"
            size="xs"
            type="button"
            onClick={open}
            className="self-start"
          >
            Try again
          </Button>
        </div>
      ) : serve.status === "stopped" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">Playground closed.</p>
          {run ? (
            <Button
              variant="outline"
              size="xs"
              type="button"
              onClick={open}
            >
              Reopen
            </Button>
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
        <Button
          size="xs"
          type="button"
          onClick={submit}
          disabled={serve.busy}
          className="shrink-0"
        >
          {serve.busy ? "Writing…" : "Generate"}
        </Button>
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
  // Axon v0.9+ describes each column; older engines send names only, and
  // every one of those is numeric.
  const columns: ServeColumn[] =
    serve.meta?.columns ??
    (serve.meta?.features ?? []).map((name) => ({ name, kind: "numeric" as const }));
  const [values, setValues] = useState<Record<string, string>>({});
  const result = serve.result?.kind === "tabular" ? serve.result : null;
  const fieldClass =
    "h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 font-mono text-[10px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40";

  const submit = () => {
    // Blank fields are left out: the engine treats them as missing.
    const input: Record<string, number | string> = {};
    for (const col of columns) {
      const v = values[col.name]?.trim();
      if (!v) continue;
      if (col.kind === "categorical") input[col.name] = v;
      else if (Number.isFinite(Number(v))) input[col.name] = Number(v);
    }
    onPredict({ input });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] text-muted-foreground">
        Fill in what you know. A blank number uses the training average; a
        blank choice counts as missing.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {columns.map((col) => (
          <label key={col.name} className="flex items-center gap-1 text-[10px]">
            <span className="w-12 shrink-0 truncate text-muted-foreground" title={col.name}>
              {col.name}
            </span>
            {col.kind === "categorical" ? (
              <select
                value={values[col.name] ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, [col.name]: e.target.value }))}
                className={fieldClass}
              >
                <option value="">—</option>
                {(col.categories ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                step="any"
                value={values[col.name] ?? ""}
                placeholder={col.mean !== undefined ? shortNum(col.mean) : undefined}
                onChange={(e) => setValues((s) => ({ ...s, [col.name]: e.target.value }))}
                className={fieldClass}
              />
            )}
          </label>
        ))}
      </div>
      <Button
        size="xs"
        type="button"
        onClick={submit}
        disabled={serve.busy}
        className="self-start"
      >
        {serve.busy ? "Predicting…" : "Predict"}
      </Button>
      {serve.error ? (
        <p className="text-[10px] text-destructive">{serve.error}</p>
      ) : null}
      {result ? <TabularResult result={result} target={serve.meta?.target ?? null} /> : null}
    </div>
  );
}

function TabularResult({
  result,
  target,
}: {
  result: Extract<PlaygroundResult, { kind: "tabular" }>;
  target: string | null;
}) {
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
      Predicted {target ?? "value"}:{" "}
      <span className="font-mono font-semibold text-foreground">
        {result.value === undefined
          ? "—"
          : result.value.toLocaleString(undefined, { maximumSignificantDigits: 6 })}
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
    <div
      className={cn(
        "mb-2 rounded-md border border-border/60 bg-muted/20 p-2.5",
        !run.paused && "nexis-run-live",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold">
          <span className="size-1.5 nexis-blink rounded-full bg-success" />
          Training
          {run.device ? (
            <span
              className={cn(
                "rounded px-1 py-px text-[9px] font-medium",
                run.device.startsWith("cuda")
                  ? "bg-success/10 text-success"
                  : "bg-muted/60 text-muted-foreground",
              )}
              title={`device: ${run.device}`}
            >
              <DeviceLabel device={run.device} />
            </span>
          ) : null}
          {run.paused ? (
            <span className="rounded bg-warning/10 px-1 py-px text-[9px] font-medium text-warning">
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
            "h-full rounded-full transition-[width] duration-(--dur-scene) ease-(--ease-enter)",
            pct === null
              ? "nexis-shimmer w-full bg-[linear-gradient(90deg,transparent,var(--brand),transparent)] bg-size-[200%_100%]"
              : "bg-brand",
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
          <Button
            variant="outline"
            size="xs"
            type="button"
            onClick={run.paused ? onResume : onPause}
          >
            {run.paused ? "Resume" : "Pause"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="xs"
          type="button"
          onClick={onCancel}
          className="hover:border-destructive/40 hover:text-destructive"
        >
          {run.status === "cancelling" ? "Force stop" : "Stop (keeps progress)"}
        </Button>
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
      ? "border-success/40 bg-success/[0.06]"
      : run.status === "cancelled"
        ? "border-warning/40 bg-warning/[0.06]"
        : "border-destructive/40 bg-destructive/[0.06]";
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
    <div className={cn("nexis-result-arrival mb-2 rounded-md border p-2.5", tone)}>
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
      <Button
        variant="brand"
        size="xs"
        type="button"
        onClick={onTrainAgain}
      >
        <Icon name="play" size="xs" />
        Train again
      </Button>
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
      ? "bg-success"
      : status === "missing"
        ? "bg-destructive/80"
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
        // react-doctor-disable-next-line react-doctor/no-array-index-as-key -- display-only list, never reordered or filtered while mounted
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
      ? "bg-success"
      : run.status === "error"
        ? "bg-destructive/80"
        : run.status === "cancelled"
          ? "bg-warning/80"
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
              ? "text-warning"
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
            <Button
              size="xs"
              type="button"
              onClick={saveMeta}
            >
              Save
            </Button>
            <Button
              variant="outline"
              size="xs"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
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
    // Re-read so an edit made since the form loaded (the Data section, or
    // the file itself) is kept; only this form's keys are replaced.
    let next = (await readTrainToml(projectDir)) ?? text;
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
              <Button
                variant="outline"
                size="xs"
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
              >
                Save
              </Button>
              <Button
                size="xs"
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
              >
                Save &amp; train
              </Button>
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

// ── Training data ─────────────────────────────────────────────────────────────
// Picks the CSV ([data] path, relative to the project), the column to
// predict ([data] target) and whether it is a category or a number ([data]
// task) for MLP projects. Pure helpers live in lib/data-source.ts; writes go
// through applyOverrides like the stock networks.

type DataPreview =
  | { kind: "loading" }
  | { kind: "unreadable" }
  | { kind: "ok"; text: string; columns: string[]; rows: number };

function DataSourceForm({
  workspaceRoot,
  projectDir,
  onSaveTrain,
}: {
  workspaceRoot: string | null;
  projectDir: string;
  onSaveTrain: () => void;
}) {
  // null until train.toml is read; false when this isn't a tabular project.
  const [tabular, setTabular] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<{
    path: string | null;
    target: string | null;
    task: string | null;
  }>({ path: null, target: null, task: null });
  const [csvs, setCsvs] = useState<string[] | null>(null);
  const [path, setPath] = useState("");
  const [target, setTarget] = useState("");
  const [task, setTask] = useState<Task | "auto">("auto");
  const [preview, setPreview] = useState<DataPreview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readTrainToml(projectDir).then((t) => {
      if (cancelled) return;
      if (t == null || parseTomlNet(t)?.kind !== "mlp") {
        setTabular(false);
        return;
      }
      const data = parseDataConfig(t);
      setTabular(true);
      setSaved(data);
      setPath(data.path ?? "");
      setTarget(data.target ?? "");
      setTask(data.task === "classification" || data.task === "regression" ? data.task : "auto");
    });
    return () => {
      cancelled = true;
    };
  }, [projectDir]);

  useEffect(() => {
    if (!tabular || !workspaceRoot) return;
    let cancelled = false;
    listWorkspaceCsvs(workspaceRoot)
      .then((abs) => {
        if (cancelled) return;
        const rel = abs
          .map((a) => relativeDataPath(projectDir, a))
          .filter((r): r is string => r != null)
          // The project's own files first, then the rest of the workspace.
          .sort(
            (a, b) =>
              Number(a.startsWith("..")) - Number(b.startsWith("..")) || a.localeCompare(b),
          );
        setCsvs(rel);
      })
      .catch(() => {
        if (!cancelled) setCsvs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tabular, workspaceRoot, projectDir]);

  useEffect(() => {
    if (!path) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreview({ kind: "loading" });
    void readTextFile(`${projectDir}/${path}`).then((text) => {
      if (cancelled) return;
      if (text == null) {
        setPreview({ kind: "unreadable" });
        return;
      }
      const { columns, rows } = summarizeCsv(text);
      setPreview({ kind: "ok", text, columns, rows });
      setTarget((t) => (columns.includes(t) ? t : (guessTarget(columns) ?? "")));
    });
    return () => {
      cancelled = true;
    };
  }, [path, projectDir]);

  const targetInfo = useMemo(
    () => (preview?.kind === "ok" && target ? summarizeTarget(preview.text, target) : null),
    [preview, target],
  );
  const columnInfo = useMemo(
    () => (preview?.kind === "ok" && target ? summarizeColumns(preview.text, target) : []),
    [preview, target],
  );

  if (!tabular) return null;

  const options = csvs ?? [];
  const pathOptions = path && !options.includes(path) ? [path, ...options] : options;
  const effectiveTask: Task = task === "auto" ? (targetInfo?.task ?? "classification") : task;
  const dirty =
    path !== (saved.path ?? "") ||
    target !== (saved.target ?? "") ||
    task !== (saved.task ?? "auto");
  const canSave =
    !saving && preview?.kind === "ok" && target !== "" && preview.columns.includes(target);
  const used = columnInfo.filter((c) => c.kind !== "skipped");
  const left = columnInfo.filter((c) => c.kind === "skipped");
  const gaps = used.filter((c) => c.missing > 0);

  const save = async (thenTrain: boolean) => {
    if (!canSave) return;
    setSaving(true);
    try {
      // Fresh read: the hyperparameter form may have saved since this loaded.
      const current = await readTrainToml(projectDir);
      if (current == null) {
        setStatus("No train.toml in this project.");
        return;
      }
      const { text } = applyOverrides(current, dataOverrides(path, target, task));
      await writeTrainToml(projectDir, text);
      setSaved({ path, target, task });
      setStatus("Saved");
      if (thenTrain) onSaveTrain();
    } catch (e) {
      setStatus(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const selectClass =
    "h-6 w-full rounded border border-border bg-background px-1 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40";

  return (
    <details open={!saved.path} className="mb-2 rounded-md border border-border/60 bg-muted/20">
      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-semibold text-foreground/90">
        Training data
        <span className="ml-1.5 font-normal text-muted-foreground">
          {saved.path
            ? `${saved.path}${saved.target ? `, predicting ${saved.target}` : ""}`
            : "built-in practice data"}
        </span>
      </summary>
      <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
        {!saved.path ? (
          <p className="text-[10.5px] text-muted-foreground">
            This project trains on made-up practice points until you choose a spreadsheet
            (CSV) from your workspace.
          </p>
        ) : null}
        <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          Spreadsheet (CSV)
          <select
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              setStatus(null);
            }}
            className={selectClass}
          >
            <option value="" disabled>
              {csvs == null
                ? "Looking for CSV files..."
                : options.length > 0
                  ? "Choose a file..."
                  : "No CSV files in this workspace"}
            </option>
            {pathOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {preview?.kind === "unreadable" ? (
          <p className="text-[10.5px] text-destructive">
            Could not read this file (missing, too large, or not text).
          </p>
        ) : null}
        {preview?.kind === "ok" ? (
          <>
            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              Column to predict
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setStatus(null);
                }}
                className={selectClass}
              >
                {preview.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              Predict
              <select
                value={task}
                onChange={(e) => {
                  setTask(e.target.value as Task | "auto");
                  setStatus(null);
                }}
                className={selectClass}
              >
                <option value="auto">
                  Decide for me ({targetInfo?.task === "regression" ? "a number" : "a category"})
                </option>
                <option value="classification">A category (which group?)</option>
                <option value="regression" disabled={targetInfo ? !targetInfo.canRegress : false}>
                  A number (how much?)
                </option>
              </select>
            </label>
            <div className="rounded border border-border/50 bg-background/50 px-2 py-1.5 text-[10.5px] text-muted-foreground">
              <p>
                {preview.rows.toLocaleString()} rows. The model learns from{" "}
                <span className="text-foreground/90">
                  {used
                    .map((c) => (c.kind === "categorical" ? `${c.name} (${c.distinct} choices)` : c.name))
                    .join(", ") || "nothing"}
                </span>
                .
              </p>
              {left.length > 0 ? (
                <p className="mt-0.5">
                  Left out: {left.map((c) => c.name).join(", ")} (empty, or too many different
                  text values to use as categories, like IDs or notes).
                </p>
              ) : null}
              {gaps.length > 0 ? (
                <p className="mt-0.5">
                  Some cells are blank in {gaps.map((c) => `${c.name} (${c.missing})`).join(", ")};
                  the model learns that a value was missing.
                </p>
              ) : null}
              {effectiveTask === "classification" && targetInfo?.classes ? (
                <p className="mt-0.5">
                  Answers in <span className="font-mono text-foreground/90">{target}</span>:{" "}
                  {targetInfo.classes.map(([label, n]) => `${label} (${n})`).join(", ")}
                </p>
              ) : effectiveTask === "classification" && targetInfo ? (
                <p className="mt-0.5 text-warning">
                  {targetInfo.distinct} different values in {target} is a lot of categories;
                  if it is a quantity, predict a number instead.
                </p>
              ) : targetInfo ? (
                <p className="mt-0.5">
                  The model estimates <span className="font-mono text-foreground/90">{target}</span>{" "}
                  and reports how far off it is on average.
                </p>
              ) : null}
              {targetInfo && targetInfo.missing > 0 ? (
                <p className="mt-0.5 text-warning">
                  {targetInfo.missing} rows have no {target} value and are skipped.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            type="button"
            disabled={!canSave || !dirty}
            onClick={() => void save(false)}
          >
            Save
          </Button>
          <Button
            size="xs"
            type="button"
            disabled={!canSave}
            onClick={() => void save(true)}
          >
            Save &amp; train
          </Button>
          {status ? <span className="text-[10px] text-muted-foreground">{status}</span> : null}
        </div>
      </div>
    </details>
  );
}
