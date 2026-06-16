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
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
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
import {
  displayMetric,
  formatElapsed,
  headlineMetric,
  runStatusWord,
  statusSentence,
  trendOf,
} from "./lib/friendly";
import type { RunSummary } from "./lib/protocol";
import type { MlTemplate } from "./lib/engine-bridge";
import { readConfusionMatrix, type ConfusionMatrix } from "./lib/artifacts";
import { readTrainToml, writeTrainToml } from "./lib/config";
import { tomlGet, tomlSet } from "./lib/toml-edit";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setMlAutoOpenOnTrain } from "@/modules/settings/store";

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
};

const BUSY_STATES = ["starting", "running", "cancelling"];

export function MlPanel({ workspaceRoot }: Props) {
  const engineStatus = useMlStore((s) => s.engineStatus);
  const engineVersion = useMlStore((s) => s.engineVersion);
  const engineError = useMlStore((s) => s.engineError);
  const installPython = useMlStore((s) => s.installPython);
  const installing = useMlStore((s) => s.installing);
  const downloadingEngine = useMlStore((s) => s.downloadingEngine);
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
  const installEngine = useMlStore((s) => s.installEngine);
  const upgradeToGpu = useMlStore((s) => s.upgradeToGpu);
  const downloadStandaloneEngine = useMlStore((s) => s.downloadStandaloneEngine);
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
  const autoOpenOnTrain = usePreferencesStore((s) => s.mlAutoOpenOnTrain);

  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    void detect(workspaceRoot);
    if (workspaceRoot) void refreshProjects(workspaceRoot);
  }, [workspaceRoot, detect, refreshProjects]);

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
          <EngineChip status={engineStatus} version={engineVersion} />
          {engineStatus === "ready" && envInfo?.cudaAvailable ? (
            <span
              className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-px text-[10px] text-emerald-500"
              title={envInfo.gpuName ?? "CUDA available"}
            >
              ⚡ GPU
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
          <HugeiconsIcon icon={Refresh01Icon} size={11} strokeWidth={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {!workspaceRoot ? (
          <p className="text-[11px] text-muted-foreground">
            Open a folder to start training models in it.
          </p>
        ) : engineStatus === "missing" ? (
          <SetupCard
            installPython={installPython}
            installing={installing}
            downloadingEngine={downloadingEngine}
            hostGpu={hostGpu}
            logs={logs}
            error={engineError}
            onInstall={(useGpu) => void installEngine(workspaceRoot, useGpu)}
            onDownloadEngine={() => void downloadStandaloneEngine()}
            onRetry={() => void redetect(workspaceRoot)}
          />
        ) : engineStatus === "detecting" || engineStatus === "idle" ? (
          <p className="text-[11px] text-muted-foreground">
            Looking for the training engine…
          </p>
        ) : (
          <>
            {/* GPU available on the machine but the engine can't use it */}
            {hostGpu && envInfo && !envInfo.cudaAvailable && installPython ? (
              <GpuUpsell
                gpuName={hostGpu}
                installing={installing}
                logs={logs}
                onUpgrade={() => void upgradeToGpu(workspaceRoot)}
              />
            ) : null}
            {/* Project picker / creation */}
            {projects.length === 0 || showCreate || pendingCreate ? (
              <CreateCard
                creating={pendingCreate != null}
                firstProject={projects.length === 0}
                createError={createError}
                onCreate={(template, name) => {
                  setShowCreate(false);
                  void createProject(workspaceRoot, template, name, true);
                }}
                onDismiss={projects.length > 0 ? () => setShowCreate(false) : undefined}
              />
            ) : (
              <div className="mb-2 flex items-center gap-1.5">
                <select
                  value={selectedProject ?? ""}
                  onChange={(e) => selectProject(e.target.value)}
                  disabled={busy}
                  className="h-6 min-w-0 flex-1 truncate rounded border border-border bg-background px-1.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                >
                  {projects.map((p) => (
                    <option key={p.dir} value={p.dir}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  disabled={busy}
                  className="h-6 shrink-0 rounded border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  title="Create a new project"
                >
                  + New
                </button>
              </div>
            )}

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

            {comparing ? (
              /* Overlay several runs on shared charts */
              <ComparisonView runs={compareRuns} onClear={clearCompare} />
            ) : (
              <>
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

                {/* Inference playground — try the trained model live */}
                <Playground run={viewedRun} />

                {/* Export a self-contained HTML report of the viewed run */}
                {viewedRun ? (
                  <button
                    type="button"
                    disabled={pendingExport != null}
                    onClick={() =>
                      void exportReport(viewedRun.projectDir, viewedRun.runId)
                    }
                    className="mt-1 rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    {pendingExport ? "Exporting…" : "⤓ Export HTML report"}
                  </button>
                ) : null}
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
          </>
        )}
      </div>
    </div>
  );
}

// ── Setup (engine missing) ────────────────────────────────────────────────────

function SetupCard({
  installPython,
  installing,
  downloadingEngine,
  hostGpu,
  logs,
  error,
  onInstall,
  onDownloadEngine,
  onRetry,
}: {
  installPython: string | null;
  installing: boolean;
  downloadingEngine: boolean;
  hostGpu: string | null;
  logs: string[];
  error: string | null;
  onInstall: (useGpu: boolean) => void;
  onDownloadEngine: () => void;
  onRetry: () => void;
}) {
  // GPU build is the better experience when a card exists; default on.
  const [useGpu, setUseGpu] = useState(true);
  const gpu = hostGpu != null;
  const sizeNote = gpu && useGpu ? "~3 GB" : "~200 MB";
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
      <p className="mb-1 text-[12px] font-semibold">Set up the ML engine</p>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        Nexis trains models with a small local tool called{" "}
        <span className="font-mono">nexis-ml</span>. Everything runs on your
        machine — no cloud, no accounts.
      </p>
      {installing ? (
        <>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] text-foreground/90">
            <span className="size-1.5 animate-pulse rounded-full bg-sky-500" />
            Installing — this downloads PyTorch ({sizeNote}), give it a few
            minutes…
          </p>
          <LogView logs={logs} />
        </>
      ) : downloadingEngine ? (
        <>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] text-foreground/90">
            <span className="size-1.5 animate-pulse rounded-full bg-sky-500" />
            Downloading the standalone engine (~31 MB)…
          </p>
          <LogView logs={logs} />
        </>
      ) : installPython ? (
        <>
          {gpu ? (
            <label className="mb-1.5 flex cursor-pointer items-start gap-1.5 text-[11px] text-foreground/90">
              <input
                type="checkbox"
                checked={useGpu}
                onChange={(e) => setUseGpu(e.target.checked)}
                className="mt-0.5 accent-emerald-500"
              />
              <span>
                Train on my GPU ({hostGpu})
                <span className="block text-[10px] text-muted-foreground/70">
                  bigger download (~3 GB), much faster on images & text
                </span>
              </span>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => onInstall(gpu && useGpu)}
            className="mb-1.5 w-full rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Install engine
          </button>
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            Installs into <span className="font-mono">{installPython}</span>{" "}
            (one {sizeNote} download, local only).
          </p>
        </>
      ) : (
        <ManualSetupSteps />
      )}
      {error && !installing && !downloadingEngine ? (
        <p className="mt-1.5 text-[10.5px] leading-snug text-red-400">{error}</p>
      ) : null}
      {!installing && !downloadingEngine ? (
        <div className="mt-2 border-t border-border/40 pt-2">
          <button
            type="button"
            onClick={onDownloadEngine}
            className="w-full rounded-md border border-border/60 px-3 py-1.5 text-[11px] font-medium text-foreground/90 transition-opacity hover:opacity-90"
          >
            Download standalone engine — no Python (~31 MB)
          </button>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
            A single binary that trains tabular & image models on your GPU
            (no PyTorch download). Text generation & the playground need the
            Python engine above.
          </p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        disabled={installing || downloadingEngine}
        className="mt-1.5 text-[10.5px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
      >
        I installed it — check again
      </button>
    </div>
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
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
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

function ManualSetupSteps() {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-muted-foreground">
        No Python found in this workspace. In the terminal:
      </p>
      <CopyLine command="py -m venv .venv" />
      <CopyLine command=".venv\Scripts\pip install nexis-ml[torch]" />
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
  firstProject,
  createError,
  onCreate,
  onDismiss,
}: {
  creating: boolean;
  firstProject: boolean;
  createError: string | null;
  onCreate: (template: MlTemplate, name: string) => void;
  onDismiss?: () => void;
}) {
  const [template, setTemplate] = useState<MlTemplate>("tabular");
  const [name, setName] = useState(TEMPLATE_OPTIONS[0].defaultName);

  // Switching template swaps in its suggested name (the user can still
  // rename); keeps "tiny-writer" from sticking on a tabular project.
  const pick = (id: MlTemplate) => {
    setTemplate(id);
    setName(TEMPLATE_OPTIONS.find((o) => o.id === id)?.defaultName ?? name);
  };

  return (
    <div className="mb-2 rounded-md border border-primary/25 bg-primary/[0.04] p-2.5">
      <div className="mb-1 flex items-start justify-between">
        <p className="text-[12px] font-semibold">
          {firstProject ? "Train your first model" : "New project"}
        </p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="text-[11px] leading-none text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        ) : null}
      </div>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        Creates a small example project with sample data — you'll see live
        results within seconds. Swap in your own data whenever you're ready.
      </p>

      {/* Template chooser */}
      <div className="mb-2 flex flex-col gap-1">
        {TEMPLATE_OPTIONS.map((opt) => {
          const selected = opt.id === template;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={creating}
              onClick={() => pick(opt.id)}
              className={cn(
                "rounded border px-2 py-1 text-left transition-colors disabled:opacity-60",
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

      {creating ? (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/90">
          <span className="size-1.5 animate-pulse rounded-full bg-sky-500" />
          Creating project…
        </p>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) onCreate(template, name);
            }}
            spellCheck={false}
            className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onCreate(template, name)}
            className="h-6 shrink-0 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create &amp; train
          </button>
        </div>
      )}
      {createError && !creating ? (
        <p className="mt-1.5 text-[10.5px] leading-snug text-red-400">
          {createError}
        </p>
      ) : null}
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
              {serve.device.startsWith("cuda") ? "⚡ GPU" : "CPU"}
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
          <span className="size-1.5 animate-pulse rounded-full bg-sky-500" />
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
        placeholder="Start of the text…"
        className="w-full resize-none rounded border border-border bg-background px-1.5 py-1 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">wildness</span>
        <input
          type="range"
          min={0.2}
          max={1.4}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
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

  // 1 Hz repaint for the elapsed timer while training.
  useEffect(() => {
    const t = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

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
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
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
              {run.device.startsWith("cuda") ? "⚡ GPU" : "CPU"}
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
        <span>
          {run.totalEpochs
            ? `pass ${run.epoch}/${run.totalEpochs} through the data`
            : `pass ${run.epoch}`}
        </span>
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
  if (summary?.device?.startsWith("cuda")) chips.push("trained on GPU ⚡");

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
}: {
  status: string;
  version: string | null;
}) {
  const dot =
    status === "ready"
      ? "bg-emerald-500"
      : status === "missing"
        ? "bg-red-500/80"
        : "bg-muted-foreground/50";
  const label =
    status === "ready"
      ? `engine ${version ?? ""}`
      : status === "missing"
        ? "setup needed"
        : "checking…";
  return (
    <span className="flex items-center gap-1 rounded bg-muted/40 px-1.5 py-px text-[10px] text-muted-foreground">
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
  const [tags, setTags] = useState((run.tags ?? []).join(", "));

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
            "shrink-0 px-1 text-[11px] leading-none",
            run.pinned
              ? "text-amber-500"
              : "text-muted-foreground/40 hover:text-foreground",
          )}
        >
          {run.pinned ? "★" : "☆"}
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label="Notes and tags"
          title="Notes & tags"
          className="mr-1 shrink-0 px-0.5 text-[10px] leading-none text-muted-foreground/50 hover:text-foreground"
        >
          ✎
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
            placeholder="Note for this run…"
            rows={2}
            spellCheck={false}
            className="w-full resize-none rounded border border-border bg-background px-1.5 py-1 text-[10.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
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

type HpType = "int" | "float" | "enum" | "intList";
type HpField = {
  section: string;
  key: string;
  label: string;
  type: HpType;
  options?: string[];
};

// Editable knobs across templates. Only fields actually present in the
// project's train.toml are rendered, so this one list covers both
// tabular and textgen (and any future template that reuses these keys).
const HP_FIELDS: HpField[] = [
  { section: "train", key: "epochs", label: "Passes (epochs)", type: "int" },
  { section: "train", key: "steps_per_epoch", label: "Steps per pass", type: "int" },
  { section: "train", key: "batch_size", label: "Batch size", type: "int" },
  { section: "train", key: "lr", label: "Learning rate", type: "float" },
  { section: "train", key: "val_split", label: "Validation split", type: "float" },
  { section: "train", key: "seed", label: "Seed", type: "int" },
  {
    section: "train",
    key: "device",
    label: "Device",
    type: "enum",
    options: ["auto", "cpu", "gpu"],
  },
  { section: "model", key: "hidden", label: "Hidden layers", type: "intList" },
  { section: "model", key: "context", label: "Context (chars)", type: "int" },
  { section: "model", key: "embed", label: "Model width", type: "int" },
  { section: "model", key: "heads", label: "Attention heads", type: "int" },
  { section: "model", key: "layers", label: "Layers", type: "int" },
  { section: "sample", key: "temperature", label: "Sampling temp", type: "float" },
  { section: "sample", key: "length", label: "Sample length", type: "int" },
];

const fieldId = (f: HpField) => `${f.section}.${f.key}`;

function rawToDisplay(type: HpType, raw: string): string {
  if (type === "enum") return raw.replace(/^"|"$/g, "");
  if (type === "intList") return raw.replace(/^\[|\]$/g, "").trim();
  return raw.trim();
}

/** Display string → TOML raw value, or null if invalid for the type. */
function displayToRaw(type: HpType, display: string): string | null {
  const d = display.trim();
  if (type === "int") {
    return d !== "" && Number.isInteger(Number(d)) ? String(Number(d)) : null;
  }
  if (type === "float") {
    return d !== "" && Number.isFinite(Number(d)) ? d : null;
  }
  if (type === "enum") return `"${d}"`;
  const parts = d.split(",").map((p) => p.trim()).filter(Boolean);
  const nums = parts.map(Number);
  if (parts.length === 0 || !nums.every((n) => Number.isInteger(n))) return null;
  return `[${nums.join(", ")}]`;
}

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
                  <span className="truncate" title={`[${f.section}] ${f.key}`}>
                    {f.label}
                  </span>
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
