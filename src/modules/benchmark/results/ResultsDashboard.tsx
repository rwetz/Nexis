import { Icon } from "@/components/icon";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BACKEND_COLOR, BACKEND_SHORT } from "@/modules/benchmark/lib/backendMeta";
import { toast } from "sonner";
import { copyRunMarkdown, exportRunCsv, exportRunJson } from "@/modules/benchmark/lib/api";
import { HistoryMenu } from "./HistoryMenu";
import { cn } from "@/lib/utils";
import { type BackendId, type BenchResult } from "@/modules/benchmark/lib/types";
import { useBenchStore } from "@/modules/benchmark/store";
import { ComparisonChart } from "./ComparisonChart";
import { RunMatrix } from "./RunMatrix";
import { SummaryStrip } from "./viz/SummaryStrip";
import { TradeoffScatter } from "./viz/TradeoffScatter";
import { METRICS, metricByKey, type MetricKey } from "./metrics";

export function ResultsDashboard() {
  const run = useBenchStore((s) => s.run);
  const models = useBenchStore((s) => s.models);
  const running = useBenchStore((s) => s.running);
  const [metricKey, setMetricKey] = useState<MetricKey>("tokensPerSec");

  const activeBackends = useMemo<BackendId[]>(() => {
    if (!run) return [];
    return [...new Set(run.matrix.map((c) => c.backendId))];
  }, [run]);

  const runModels = useMemo(() => {
    if (!run) return [];
    const ids = new Set(run.matrix.map((c) => c.modelId));
    return models.filter((m) => ids.has(m.id));
  }, [run, models]);

  if (!run) return <EmptyState />;

  const metric = metricByKey(metricKey);
  const completed = run.results.length;
  const total = run.matrix.length;

  return (
    <div className="nexis-scene-enter flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetricKey(m.key)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium whitespace-nowrap transition-colors",
                metricKey === m.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="mr-1 font-mono text-[11px] text-muted-foreground tabular-nums">
            {completed}/{total} {running ? "running…" : "done"}
          </span>
          <HistoryMenu />
          <Button
            variant="outline"
            size="sm"
            disabled={completed === 0}
            className="rounded-md"
            onClick={async () => {
              const ok = await copyRunMarkdown(run, models);
              if (ok) toast.success("Copied results as Markdown");
              else toast.error("Clipboard unavailable");
            }}
          >
            <Icon name="copy" size="sm" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={completed === 0}
            className="rounded-md"
            onClick={() => exportRunCsv(run, models)}
          >
            <Icon name="download" size="sm" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={completed === 0}
            className="rounded-md"
            onClick={() => exportRunJson(run, models)}
          >
            <Icon name="file-code" size="sm" />
            JSON
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto nexis-scrollbar">
        <div className="@container mx-auto flex w-full max-w-[1700px] flex-col gap-6 px-5 py-5 lg:px-8 2xl:px-10">
          {/* Leaders */}
          <SummaryStrip results={run.results} models={models} />

          {/* Comparison */}
          <section className="rounded-2xl border border-border bg-card p-5 lg:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">{metric.label}</h2>
                <p className="text-[11px] text-muted-foreground">
                  {metric.better === "high" ? "Higher is better" : "Lower is better"} · ★ marks the
                  winner per model
                </p>
              </div>
              <Legend backendIds={activeBackends} />
            </div>
            <ComparisonChart
              metric={metric}
              models={runModels}
              backendIds={activeBackends}
              results={run.results}
            />
            <MetricsProvenance results={run.results} />
          </section>

          {/* Efficiency map */}
          <section className="rounded-2xl border border-border bg-card p-5 lg:p-6">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Efficiency map</h2>
              <p className="text-[11px] text-muted-foreground">
                Throughput vs latency (log–log) · the dashed line is the Pareto frontier — points
                where nothing else is both faster and higher-throughput. Top-left is ideal.
              </p>
            </div>
            <TradeoffScatter results={run.results} models={models} />
          </section>

          {/* Per-cell detail */}
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Run matrix
            </h2>
            <RunMatrix />
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricsProvenance({ results }: { results: BenchResult[] }) {
  const hasSim = results.some((r) => r.simulated);
  const real = results.find((r) => !r.simulated && r.status === "done");
  if (!hasSim && !real) return null;
  return (
    <div className="mt-4 flex flex-col gap-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
      {real && (
        <p>
          <span className="font-medium text-emerald-500">● Real.</span>{" "}
          {real.note ??
            "Measured from a live engine."}
        </p>
      )}
      {hasSim && (
        <p>
          <span className="font-medium text-foreground">● Simulated.</span> Synthetic metrics — the
          harness, protocol, and UI are real; ONNX Runtime drops in behind the same interface next.
        </p>
      )}
      {real && hasSim && (
        <p className="text-muted-foreground/70">
          Note: real and simulated bars use different units and aren't directly comparable yet.
        </p>
      )}
    </div>
  );
}

function Legend({ backendIds }: { backendIds: BackendId[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {backendIds.map((b) => (
        <span key={b} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: BACKEND_COLOR[b] }}
          />
          {BACKEND_SHORT[b]}
        </span>
      ))}
    </div>
  );
}

function EmptyState() {
  // The standalone app put its own logomark here. Inside Nexis that would be a
  // second brand sitting inside the first, so the mark is gone and the copy is
  // rewritten for a panel that sits below its controls rather than beside them.
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-5 @4xl:p-8">
      <div className="nexis-scene-enter w-full max-w-2xl">
        <div className="mx-auto mb-5 grid size-11 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Icon name="activity" size="lg" />
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-muted-foreground">
            Results canvas
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight">Your comparison will land here</h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            Add models, choose the engines that can run them, then start the benchmark. Live
            throughput, latency, memory, and accuracy will appear as each cell finishes.
          </p>
        </div>
        <div className="nexis-stagger mt-6 grid gap-2.5 @2xl:grid-cols-3">
          <EmptyStep icon="folder-open" step="01" title="Add models" detail="ONNX or GGUF" />
          <EmptyStep icon="cpu" step="02" title="Choose engines" detail="Compatible runtimes" />
          <EmptyStep icon="play" step="03" title="Run comparison" detail="Results stream live" />
        </div>
      </div>
    </div>
  );
}

function EmptyStep({
  icon,
  step,
  title,
  detail,
}: {
  icon: "folder-open" | "cpu" | "play";
  step: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/55 px-3 py-3 text-left">
      <Icon name={icon} size="sm" className="text-primary" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-primary/80">{step}</span>
          <span className="text-xs font-medium">{title}</span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
