import { BACKEND_COLOR, BACKEND_SHORT } from "@/lib/backendMeta";
import { cn } from "@/lib/utils";
import { cellKey, type BackendId, type BenchResult, type ModelInfo } from "@/lib/types";
import { type MetricDef } from "./metrics";

interface Props {
  metric: MetricDef;
  models: ModelInfo[];
  backendIds: BackendId[];
  results: BenchResult[];
}

/** Grouped horizontal bar chart — one row group per model, one bar per backend. */
export function ComparisonChart({ metric, models, backendIds, results }: Props) {
  const byCell = new Map(results.map((r) => [cellKey(r.modelId, r.backendId), r]));

  // Scale across every visible value so bars are comparable.
  const values: number[] = [];
  for (const r of results) {
    const v = r.metrics ? metric.get(r.metrics) : null;
    if (v != null && Number.isFinite(v)) values.push(v);
  }
  const max = values.length ? Math.max(...values) : 1;

  const rows = models.filter((m) =>
    backendIds.some((b) => byCell.has(cellKey(m.id, b))),
  );

  if (rows.length === 0) {
    return (
      <div className="grid place-items-center py-10 text-sm text-muted-foreground">
        No results for this metric yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((model) => {
        // Best value among this model's backends for winner marking.
        const cellVals = backendIds
          .map((b) => byCell.get(cellKey(model.id, b))?.metrics)
          .map((m) => (m ? metric.get(m) : null))
          .filter((v): v is number => v != null && Number.isFinite(v));
        const best =
          cellVals.length === 0
            ? null
            : metric.better === "high"
              ? Math.max(...cellVals)
              : Math.min(...cellVals);

        return (
          <div key={model.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="truncate text-[12px] font-medium">{model.name}</span>
              {model.paramsLabel && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {model.paramsLabel}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {backendIds.map((b) => {
                const res = byCell.get(cellKey(model.id, b));
                const v = res?.metrics ? metric.get(res.metrics) : null;
                const valid = v != null && Number.isFinite(v);
                const pct = valid ? Math.max(2, (v! / max) * 100) : 0;
                const isBest = valid && best != null && v === best && cellVals.length > 1;
                return (
                  <div key={b} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 truncate text-right font-mono text-[10px] text-muted-foreground">
                      {BACKEND_SHORT[b]}
                    </span>
                    <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted/40">
                      {[25, 50, 75].map((g) => (
                        <span
                          key={g}
                          className="absolute inset-y-0 w-px bg-border/50"
                          style={{ left: `${g}%` }}
                        />
                      ))}
                      <div
                        className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: BACKEND_COLOR[b],
                          opacity: valid ? (isBest ? 1 : 0.78) : 0,
                        }}
                      />
                      <span
                        className={cn(
                          "absolute inset-y-0 right-2 flex items-center font-mono text-[10.5px] font-medium tabular-nums",
                          valid ? "text-foreground" : "text-muted-foreground/50",
                        )}
                      >
                        {valid ? metric.format(v!) : res?.status === "error" ? "error" : "—"}
                        {isBest && <span className="ml-1 text-[9px]">★</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
