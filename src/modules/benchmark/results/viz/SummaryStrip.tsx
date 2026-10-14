import { BACKEND_COLOR, BACKEND_SHORT } from "@/modules/benchmark/lib/backendMeta";
import { measuresModel } from "@/modules/benchmark/lib/provenance";
import { type BenchResult, type ModelInfo, type TaskType } from "@/modules/benchmark/lib/types";
import { pickLeaders } from "../leaders";

/** Scannable "leaders" across the run — one tile per headline metric. */
export function SummaryStrip({
  results,
  models,
  task,
}: {
  results: BenchResult[];
  models: ModelInfo[];
  task: TaskType;
}) {
  const tiles = pickLeaders(results, models, task);
  const engineOnly = results.some((r) => r.status === "done" && r.metrics && !measuresModel(r));
  if (tiles.length === 0 && !engineOnly) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3.5 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {t.label}
              </span>
              <span className="font-mono text-xl font-semibold tabular-nums leading-none">{t.value}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ background: BACKEND_COLOR[t.backendId] }} />
                <span className="truncate">{t.modelName}</span>
                <span className="shrink-0 text-muted-foreground/50">· {BACKEND_SHORT[t.backendId]}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {engineOnly && (
        <p className="text-[10.5px] text-muted-foreground">
          {BACKEND_SHORT.nexis} results are not ranked here: it trains a synthetic workload rather
          than running your model. They appear under engine training throughput below.
        </p>
      )}
    </div>
  );
}
