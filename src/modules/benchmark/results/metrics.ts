import { formatBytes } from "@/lib/format";
import { formatCompact, formatMs } from "@/modules/benchmark/lib/format";
import { throughputUnit } from "@/modules/benchmark/lib/provenance";
import { type BackendId, type BenchMetrics, type TaskType } from "@/modules/benchmark/lib/types";

export type MetricKey =
  | "tokensPerSec"
  | "firstTokenMs"
  | "latencyMeanMs"
  | "latencyP95Ms"
  | "peakMemBytes"
  | "accuracy";

export interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  /** Which direction is better — drives winner highlighting. */
  better: "high" | "low";
  get: (m: BenchMetrics) => number | null | undefined;
  /** Task and backend decide the unit (tok/s, inferences/s, samples/s). */
  format: (v: number, task: TaskType, backendId: BackendId) => string;
}

export const METRICS: MetricDef[] = [
  {
    key: "tokensPerSec",
    label: "Throughput",
    short: "rate",
    better: "high",
    get: (m) => m.tokensPerSec,
    format: (v, task, backendId) => `${formatCompact(v)} ${throughputUnit(task, backendId).long}`,
  },
  {
    key: "firstTokenMs",
    label: "First-token latency",
    short: "TTFT",
    better: "low",
    get: (m) => m.firstTokenMs,
    format: formatMs,
  },
  {
    key: "latencyMeanMs",
    label: "Mean latency",
    short: "mean",
    better: "low",
    get: (m) => m.latencyMeanMs,
    format: formatMs,
  },
  {
    key: "latencyP95Ms",
    label: "p95 latency",
    short: "p95",
    better: "low",
    get: (m) => m.latencyP95Ms,
    format: formatMs,
  },
  {
    key: "peakMemBytes",
    label: "Peak memory",
    short: "mem",
    better: "low",
    get: (m) => m.peakMemBytes,
    format: formatBytes,
  },
  {
    key: "accuracy",
    label: "Accuracy",
    short: "acc",
    better: "high",
    get: (m) => m.accuracy ?? null,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
];

export const metricByKey = (k: MetricKey) => METRICS.find((m) => m.key === k)!;
