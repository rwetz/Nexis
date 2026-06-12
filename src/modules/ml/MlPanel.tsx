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
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { useMlStore, getSeriesMap, type ActiveRun, type HistoricalRun } from "./store";
import { MetricChart } from "./MetricChart";
import {
  displayMetric,
  formatElapsed,
  headlineMetric,
  runStatusWord,
  statusSentence,
  trendOf,
} from "./lib/friendly";
import type { RunSummary } from "./lib/protocol";

type Props = {
  workspaceRoot: string | null;
};

const BUSY_STATES = ["starting", "running", "cancelling"];

export function MlPanel({ workspaceRoot }: Props) {
  const engineStatus = useMlStore((s) => s.engineStatus);
  const engineVersion = useMlStore((s) => s.engineVersion);
  const installPython = useMlStore((s) => s.installPython);
  const installing = useMlStore((s) => s.installing);
  const envInfo = useMlStore((s) => s.envInfo);
  const hostGpu = useMlStore((s) => s.hostGpu);
  const projects = useMlStore((s) => s.projects);
  const selectedProject = useMlStore((s) => s.selectedProject);
  const pendingCreate = useMlStore((s) => s.pendingCreate);
  const activeRun = useMlStore((s) => s.activeRun);
  const lastSummary = useMlStore((s) => s.lastSummary);
  const chartSource = useMlStore((s) => s.chartSource);
  const lastValues = useMlStore((s) => s.lastValues);
  const logs = useMlStore((s) => s.logs);
  const runs = useMlStore((s) => s.runs);
  const runsLoading = useMlStore((s) => s.runsLoading);

  const detect = useMlStore((s) => s.detect);
  const redetect = useMlStore((s) => s.redetect);
  const installEngine = useMlStore((s) => s.installEngine);
  const upgradeToGpu = useMlStore((s) => s.upgradeToGpu);
  const refreshProjects = useMlStore((s) => s.refreshProjects);
  const selectProject = useMlStore((s) => s.selectProject);
  const createProject = useMlStore((s) => s.createProject);
  const startTrain = useMlStore((s) => s.startTrain);
  const cancelActive = useMlStore((s) => s.cancelActive);
  const refreshRuns = useMlStore((s) => s.refreshRuns);
  const loadHistoricalRun = useMlStore((s) => s.loadHistoricalRun);

  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    void detect(workspaceRoot);
    if (workspaceRoot) void refreshProjects(workspaceRoot);
  }, [workspaceRoot, detect, refreshProjects]);

  const busy = activeRun != null && BUSY_STATES.includes(activeRun.status);
  const finished =
    activeRun != null && ["ok", "cancelled", "error"].includes(activeRun.status);

  const metricNames = useMemo(() => Object.keys(lastValues).sort(), [lastValues]);
  const hero = useMemo(() => headlineMetric(metricNames), [metricNames]);
  const restMetrics = useMemo(
    () => metricNames.filter((n) => n !== hero),
    [metricNames, hero],
  );

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
            hostGpu={hostGpu}
            logs={logs}
            onInstall={(useGpu) => void installEngine(workspaceRoot, useGpu)}
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
                onCreate={(name) => {
                  setShowCreate(false);
                  void createProject(workspaceRoot, name, true);
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
              <ProgressBlock run={activeRun} onCancel={() => void cancelActive()} />
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
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Past runs {runsLoading ? "…" : ""}
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
                      disabled={busy}
                      onClick={() => void loadHistoricalRun(run)}
                    />
                  ))}
                </div>
              )}
            </div>
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
  hostGpu,
  logs,
  onInstall,
  onRetry,
}: {
  installPython: string | null;
  installing: boolean;
  hostGpu: string | null;
  logs: string[];
  onInstall: (useGpu: boolean) => void;
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
      <button
        type="button"
        onClick={onRetry}
        disabled={installing}
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
  onCreate,
  onDismiss,
}: {
  creating: boolean;
  firstProject: boolean;
  onCreate: (name: string) => void;
  onDismiss?: () => void;
}) {
  const [name, setName] = useState("my-first-model");
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
        charts within seconds. Swap in your own CSV whenever you're ready.
      </p>
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
              if (e.key === "Enter" && name.trim()) onCreate(name);
            }}
            spellCheck={false}
            className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onCreate(name)}
            className="h-6 shrink-0 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create &amp; train
          </button>
        </div>
      )}
    </div>
  );
}

// ── Live progress ─────────────────────────────────────────────────────────────

function ProgressBlock({ run, onCancel }: { run: ActiveRun; onCancel: () => void }) {
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

      <p className="mb-1.5 text-[11px] leading-snug text-foreground/90">{sentence}</p>

      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
      >
        {run.status === "cancelling" ? "Force stop" : "Stop (keeps progress)"}
      </button>
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
  disabled,
  onClick,
}: {
  run: HistoricalRun;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
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

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors",
        selected ? "bg-primary/[0.08]" : "hover:bg-muted/50",
        disabled && "cursor-default opacity-60",
      )}
      title={`${run.id} — ${runStatusWord(run.status)}`}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      <span className="min-w-0 flex-1 truncate text-[10.5px] text-foreground/85">
        {friendlyRunName(run.id)}
        <span className="text-muted-foreground/60"> · {runStatusWord(run.status)}</span>
      </span>
      {metric ? (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {metric}
        </span>
      ) : null}
    </button>
  );
}
