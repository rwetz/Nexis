// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Plain-language layer for the ML panel: metric names, trend detection,
 * and the one-sentence status line. The goal is that someone who has
 * never trained a model can read the panel and know what's happening.
 */
import type { Series } from "./series";

export type MetricDisplay = {
  /** Human label ("Accuracy" instead of "acc/val"). */
  label: string;
  /** Which direction means the model is getting better. */
  better: "up" | "down";
  /** One-line explanation for the chart caption. */
  hint: string;
  format: (v: number) => string;
};

export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return v.toExponential(2);
  return v.toPrecision(4).replace(/\.?0+$/, "");
}

const percent = (v: number) => `${(v * 100).toFixed(1)}%`;

const KNOWN_METRICS: Record<string, MetricDisplay> = {
  "acc/val": {
    label: "Accuracy",
    better: "up",
    hint: "How often the model predicts correctly — higher is better",
    format: percent,
  },
  "loss/train": {
    label: "Training loss",
    better: "down",
    hint: "The model's error on data it's learning from — lower is better",
    format: formatValue,
  },
  "loss/val": {
    label: "Validation loss",
    better: "down",
    hint: "Error on data the model has never seen — lower is better",
    format: formatValue,
  },
  "rmse/val": {
    label: "Prediction error",
    better: "down",
    hint: "Average distance between predictions and truth — lower is better",
    format: formatValue,
  },
  "perplexity/val": {
    label: "Perplexity",
    better: "down",
    hint: "How many characters the model is effectively choosing between — lower (toward 1) is better",
    format: formatValue,
  },
  "mem/gpu_mb": {
    label: "GPU memory",
    better: "down",
    hint: "GPU memory in use while training",
    format: (v) => `${Math.round(v)} MB`,
  },
};

export function displayMetric(name: string): MetricDisplay {
  return (
    KNOWN_METRICS[name] ?? {
      label: name,
      better: "down",
      hint: "",
      format: formatValue,
    }
  );
}

/** Which metric headlines the panel, in order of how meaningful it is
 *  to a non-expert. */
const HEADLINE_PRIORITY = ["acc/val", "rmse/val", "loss/val", "loss/train"];

export function headlineMetric(names: string[]): string | null {
  for (const name of HEADLINE_PRIORITY) {
    if (names.includes(name)) return name;
  }
  return names.length > 0 ? [...names].sort()[0] : null;
}

export type Trend = "improving" | "steady" | "worsening";

/**
 * Compare the latest value against a value ~20% of the series back.
 * Direction-aware: falling loss and rising accuracy both "improving".
 */
export function trendOf(series: Series | undefined, better: "up" | "down"): Trend {
  if (!series || series.values.length < 5) return "steady";
  const n = series.values.length;
  const lookback = Math.max(4, Math.floor(n * 0.2));
  const prev = series.values[n - 1 - lookback] ?? series.values[0];
  const last = series.values[n - 1];
  const span = Math.max(Math.abs(prev), Math.abs(last), 1e-9);
  const delta = (last - prev) / span;
  if (Math.abs(delta) < 0.01) return "steady";
  const rising = delta > 0;
  return rising === (better === "up") ? "improving" : "worsening";
}

export type RunPhase =
  | "starting"
  | "running"
  | "cancelling"
  | "ok"
  | "cancelled"
  | "error";

/** The one-sentence "what is going on" line under the progress bar. */
export function statusSentence(args: {
  phase: RunPhase;
  epoch: number;
  totalEpochs: number | null;
  headlineName: string | null;
  headlineValue: number | undefined;
  trend: Trend;
}): string {
  const { phase, epoch, totalEpochs, headlineName, headlineValue, trend } = args;
  const metric = headlineName ? displayMetric(headlineName) : null;
  const value =
    metric && typeof headlineValue === "number"
      ? `${metric.label.toLowerCase()} is ${metric.format(headlineValue)}`
      : null;

  switch (phase) {
    case "starting":
      return "Starting the training engine…";
    case "running": {
      if (!value) return "Reading your data…";
      const where = totalEpochs
        ? `pass ${Math.max(epoch, 1)} of ${totalEpochs} through the data`
        : `pass ${Math.max(epoch, 1)} through the data`;
      const trendText =
        trend === "improving"
          ? " and improving"
          : trend === "worsening"
            ? " — watch for overfitting"
            : "";
      return `Learning: ${where} — ${value}${trendText}.`;
    }
    case "cancelling":
      return "Stopping — saving a checkpoint first…";
    case "ok":
      return value
        ? `Done! Final ${value}.`
        : "Done! Training finished cleanly.";
    case "cancelled":
      return `Stopped early — progress up to pass ${epoch} was saved.`;
    case "error":
      return "Something went wrong — open Details below for the full output.";
  }
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Friendly one-liner for a finished historical run row. */
export function runStatusWord(status: string): string {
  switch (status) {
    case "ok":
      return "completed";
    case "cancelled":
      return "stopped early";
    case "error":
      return "failed";
    default:
      return "interrupted";
  }
}
