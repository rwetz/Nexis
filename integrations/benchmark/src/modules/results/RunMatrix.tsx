import { BACKEND_COLOR, BACKEND_SHORT } from "@/lib/backendMeta";
import { cn, formatBytes, formatCompact, formatMs } from "@/lib/utils";
import {
  cellKey,
  PHASE_LABELS,
  type BackendId,
  type BenchProgress,
  type BenchResult,
  type ModelInfo,
} from "@/lib/types";
import { useBenchStore } from "@/store/useBenchStore";
import { NOISY_CV, sampleStats } from "@/lib/stats";
import { DistributionStrip } from "./viz/DistributionStrip";

export function RunMatrix() {
  const run = useBenchStore((s) => s.run);
  const models = useBenchStore((s) => s.models);
  const progress = useBenchStore((s) => s.progress);
  if (!run) return null;

  const byCell = new Map(run.results.map((r) => [cellKey(r.modelId, r.backendId), r]));
  const modelById = new Map(models.map((m) => [m.id, m]));

  return (
    <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
      {run.matrix.map((cell) => {
        const k = cellKey(cell.modelId, cell.backendId);
        return (
          <Cell
            key={k}
            model={modelById.get(cell.modelId)}
            backendId={cell.backendId}
            result={byCell.get(k)}
            progress={progress[k]}
          />
        );
      })}
    </div>
  );
}

function Cell({
  model,
  backendId,
  result,
  progress,
}: {
  model?: ModelInfo;
  backendId: BackendId;
  result?: BenchResult;
  progress?: BenchProgress;
}) {
  const done = result?.status === "done" && result.metrics;
  const errored = result?.status === "error";
  const phase = result ? (errored ? "error" : "done") : (progress?.phase ?? "queued");
  const running = phase === "loading" || phase === "warmup" || phase === "measuring";
  const pct =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3 transition-colors",
        running ? "border-brand/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: BACKEND_COLOR[backendId] }}
        />
        <span className="font-mono text-[11px] font-medium">{BACKEND_SHORT[backendId]}</span>
        {done &&
          (result!.simulated ? (
            <span className="rounded bg-muted px-1 py-px text-[9px] font-medium uppercase text-muted-foreground">
              sim
            </span>
          ) : (
            <span
              title={result!.note ?? "Measured from a live engine"}
              className="rounded bg-emerald-500/15 px-1 py-px text-[9px] font-medium uppercase text-emerald-500"
            >
              real
            </span>
          ))}
        <span className="ml-auto truncate text-[10.5px] text-muted-foreground">
          {model?.paramsLabel ?? model?.format}
        </span>
      </div>
      <div className="truncate text-[12px] font-medium leading-tight">{model?.name ?? "—"}</div>

      {done ? (
        <>
          <div className="mt-0.5 grid grid-cols-3 gap-2">
            <Stat label="tok/s" value={formatCompact(result!.metrics!.tokensPerSec)} />
            <Stat label="TTFT" value={formatMs(result!.metrics!.firstTokenMs)} />
            <Stat label="mem" value={formatBytes(result!.metrics!.peakMemBytes, 0)} />
            <Stat label="p50" value={formatMs(result!.metrics!.latencyP50Ms)} />
            <Stat label="p95" value={formatMs(result!.metrics!.latencyP95Ms)} />
            <Stat
              label="acc"
              value={
                result!.metrics!.accuracy != null
                  ? `${(result!.metrics!.accuracy * 100).toFixed(1)}%`
                  : "—"
              }
            />
          </div>
          {(() => {
            const samples = result!.metrics!.samplesMs;
            if (samples.length <= 1) return null;
            const st = sampleStats(samples);
            const noisy = st.cv > NOISY_CV;
            return (
              <div className="mt-1 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-muted-foreground/60">
                  <span>latency spread · {samples.length} runs</span>
                  <span
                    className={cn(
                      "font-mono normal-case tracking-normal",
                      noisy ? "text-amber-500" : "text-muted-foreground/60",
                    )}
                  >
                    CV {(st.cv * 100).toFixed(1)}%{noisy ? " · noisy" : ""}
                  </span>
                </div>
                <DistributionStrip samples={samples} color={BACKEND_COLOR[backendId]} />
              </div>
            );
          })()}
        </>
      ) : errored ? (
        <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          {result?.error ?? "Benchmark failed"}
        </div>
      ) : (
        (() => {
          // Some backends (llama-bench) can't report sub-progress — show an
          // indeterminate pulse rather than a stuck 0%.
          const indeterminate = phase === "measuring" && (progress?.current ?? 0) === 0;
          const width =
            phase === "queued" ? 0 : phase === "measuring" && !indeterminate ? pct : indeterminate ? 35 : 12;
          return (
            <div className="mt-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                <span>{PHASE_LABELS[phase]}</span>
                {phase === "measuring" && !indeterminate && (
                  <span className="font-mono">
                    {progress?.current ?? 0}/{progress?.total ?? 0}
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full bg-brand transition-[width] duration-300",
                    phase === "loading" || phase === "warmup" || indeterminate ? "animate-pulse" : "",
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <span className="font-mono text-[12px] font-medium tabular-nums">{value}</span>
    </div>
  );
}
