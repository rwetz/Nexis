import { BACKEND_COLOR, BACKEND_SHORT } from "@/modules/benchmark/lib/backendMeta";
import { cn } from "@/lib/utils";
import { ENGINE_WORKLOAD_LABEL, measuresModel } from "@/modules/benchmark/lib/provenance";
import {
  cellKey,
  type BackendId,
  type BenchResult,
  type ModelInfo,
  type TaskType,
} from "@/modules/benchmark/lib/types";
import { type MetricDef } from "./metrics";

interface Props {
  metric: MetricDef;
  models: ModelInfo[];
  backendIds: BackendId[];
  results: BenchResult[];
  task: TaskType;
}

const valueOf = (metric: MetricDef, r: BenchResult | undefined) => {
  const v = r?.metrics ? metric.get(r.metrics) : null;
  return v != null && Number.isFinite(v) ? v : null;
};

/**
 * Grouped horizontal bar chart — one row group per model, one bar per backend
 * that ran that model. Engine-workload results (Axon) describe a
 * synthetic training task, so they get their own section and scale instead of
 * a bar under a model's name.
 */
export function ComparisonChart({ metric, models, backendIds, results, task }: Props) {
  const modelResults = results.filter(measuresModel);
  const engineResults = results.filter((r) => !measuresModel(r));
  const modelBackends = backendIds.filter((b) => measuresModel({ backendId: b }));
  const byCell = new Map(modelResults.map((r) => [cellKey(r.modelId, r.backendId), r]));

  // Scale across every visible model value so bars are comparable.
  const values = modelResults
    .map((r) => valueOf(metric, r))
    .filter((v): v is number => v != null);
  const max = values.length ? Math.max(...values) : 1;

  const rows = models.filter((m) =>
    modelBackends.some((b) => byCell.has(cellKey(m.id, b))),
  );

  if (rows.length === 0 && engineResults.length === 0) {
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
        const cellVals = modelBackends
          .map((b) => valueOf(metric, byCell.get(cellKey(model.id, b))))
          .filter((v): v is number => v != null);
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
              {modelBackends.map((b) => {
                const res = byCell.get(cellKey(model.id, b));
                const v = valueOf(metric, res);
                return (
                  <Bar
                    key={b}
                    label={BACKEND_SHORT[b]}
                    color={BACKEND_COLOR[b]}
                    value={v}
                    max={max}
                    text={v != null ? metric.format(v, task, b) : res?.status === "error" ? "error" : "—"}
                    isBest={v != null && v === best && cellVals.length > 1}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {engineResults.length > 0 && (
        <EngineWorkload metric={metric} results={engineResults} task={task} />
      )}
    </div>
  );
}

/** Axon runs: own scale, no winner, never under a model's name. */
function EngineWorkload({
  metric,
  results,
  task,
}: {
  metric: MetricDef;
  results: BenchResult[];
  task: TaskType;
}) {
  const vals = results.map((r) => valueOf(metric, r)).filter((v): v is number => v != null);
  const max = vals.length ? Math.max(...vals) : 1;
  return (
    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
      <div className="flex flex-col">
        <span className="truncate text-[12px] font-medium">{ENGINE_WORKLOAD_LABEL}</span>
        <span className="text-[10.5px] text-muted-foreground">
          {BACKEND_SHORT.nexis} trains a fixed synthetic task and does not run your model, so these
          numbers are not comparable with the bars above
          {metric.key === "accuracy" ? " (accuracy is the workload's validation accuracy)" : ""}.
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {results.map((r, i) => {
          const v = valueOf(metric, r);
          return (
            <Bar
              key={r.id}
              label={results.length > 1 ? `run ${i + 1}` : BACKEND_SHORT[r.backendId]}
              color={BACKEND_COLOR[r.backendId]}
              value={v}
              max={max}
              text={v != null ? metric.format(v, task, r.backendId) : r.status === "error" ? "error" : "—"}
              isBest={false}
            />
          );
        })}
      </div>
    </div>
  );
}

function Bar({
  label,
  color,
  value,
  max,
  text,
  isBest,
}: {
  label: string;
  color: string;
  value: number | null;
  max: number;
  text: string;
  isBest: boolean;
}) {
  const valid = value != null;
  const pct = valid ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-right font-mono text-[10px] text-muted-foreground">
        {label}
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
            backgroundColor: color,
            opacity: valid ? (isBest ? 1 : 0.78) : 0,
          }}
        />
        <span
          className={cn(
            "absolute inset-y-0 right-2 flex items-center font-mono text-[10.5px] font-medium tabular-nums",
            valid ? "text-foreground" : "text-muted-foreground/50",
          )}
        >
          {text}
          {isBest && <span className="ml-1 text-[9px]">★</span>}
        </span>
      </div>
    </div>
  );
}
