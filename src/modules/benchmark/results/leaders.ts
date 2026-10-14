import { formatBytes } from "@/lib/format";
import { formatMs } from "@/modules/benchmark/lib/format";
import { measuresModel } from "@/modules/benchmark/lib/provenance";
import { type BenchResult, type ModelInfo, type TaskType } from "@/modules/benchmark/lib/types";
import { metricByKey } from "./metrics";

export interface Leader {
  label: string;
  value: string;
  modelName: string;
  backendId: BenchResult["backendId"];
}

/**
 * One "leader" per headline metric, chosen only among results that measured
 * the model itself. Engine-workload results (Axon) never win a tile:
 * their numbers describe a synthetic training task, not the model they sit
 * next to, so naming the model as the winner would be false.
 */
export function pickLeaders(
  results: BenchResult[],
  models: ModelInfo[],
  task: TaskType,
): Leader[] {
  const done = results.filter((r) => r.status === "done" && r.metrics && measuresModel(r));
  const nameOf = (id: string) => models.find((m) => m.id === id)?.name ?? id;

  const best = (
    label: string,
    pick: (r: BenchResult) => number | null | undefined,
    dir: "max" | "min",
    fmt: (v: number, r: BenchResult) => string,
  ): Leader | null => {
    let win: BenchResult | null = null;
    let winV = dir === "max" ? -Infinity : Infinity;
    for (const r of done) {
      const v = pick(r);
      if (v == null || !Number.isFinite(v)) continue;
      if ((dir === "max" && v > winV) || (dir === "min" && v < winV)) {
        winV = v;
        win = r;
      }
    }
    if (!win) return null;
    return {
      label,
      value: fmt(winV, win),
      modelName: nameOf(win.modelId),
      backendId: win.backendId,
    };
  };

  const throughput = metricByKey("tokensPerSec");
  const accuracy = metricByKey("accuracy");
  return [
    best("Fastest", (r) => r.metrics?.tokensPerSec, "max", (v, r) =>
      throughput.format(v, task, r.backendId),
    ),
    best("Snappiest", (r) => r.metrics?.firstTokenMs, "min", formatMs),
    best(
      "Leanest",
      (r) => ((r.metrics?.peakMemBytes || 0) > 0 ? r.metrics?.peakMemBytes : null),
      "min",
      (v) => formatBytes(v),
    ),
    best("Most accurate", (r) => r.metrics?.accuracy ?? null, "max", (v, r) =>
      accuracy.format(v, task, r.backendId),
    ),
  ].filter((t): t is Leader => t !== null);
}
