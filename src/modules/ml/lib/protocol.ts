// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * nexis-ml protocol v1 types + line parsing.
 *
 * Canonical spec: ML_SUITE.md (this repo) / PROTOCOL.md (engine repo).
 * Per the protocol's forward-compatibility rule, unknown event types and
 * unknown fields are preserved but ignored by consumers.
 */

export type MetricStats = {
  last: number;
  min: number;
  max: number;
  count: number;
};

export type RunSummary = {
  status: string;
  name?: string;
  startedAt?: string;
  finishedAt?: string;
  totalEpochs?: number | null;
  lastEpoch?: number | null;
  device?: string | null;
  metrics?: Record<string, MetricStats>;
  artifacts?: { kind: string; path: string }[];
};

export type MlEvent =
  | {
      ev: "run.started";
      run: string;
      name?: string;
      dir?: string;
      config?: unknown;
      totalEpochs?: number | null;
      device?: string | null;
      protocol?: number;
      startedAt?: string;
    }
  | {
      ev: "metric";
      run: string;
      step: number;
      epoch?: number | null;
      name: string;
      value: number;
    }
  | { ev: "epoch"; run: string; epoch: number; of?: number | null }
  | { ev: "artifact"; run: string; kind: string; path: string }
  | { ev: "sample"; run: string; input?: unknown; output?: unknown }
  | { ev: "log"; run: string; level?: string; msg: string }
  | { ev: "run.finished"; run: string; status: string; summary?: RunSummary };

/** All `ev` values this client understands. */
const KNOWN_EVENTS = new Set([
  "run.started",
  "metric",
  "epoch",
  "artifact",
  "sample",
  "log",
  "run.finished",
]);

/**
 * Parse one NDJSON protocol line. Returns null for blank lines, invalid
 * JSON, missing/unknown `ev`, or a `metric` without a numeric value —
 * protocol rule: ignore what you don't understand, never throw.
 */
export function parseProtocolLine(line: string): MlEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const ev = (obj as { ev?: unknown }).ev;
  if (typeof ev !== "string" || !KNOWN_EVENTS.has(ev)) return null;
  if (ev === "metric") {
    const m = obj as { name?: unknown; value?: unknown };
    if (typeof m.name !== "string" || typeof m.value !== "number") return null;
  }
  return obj as MlEvent;
}

// ── Serve (inference) protocol ────────────────────────────────────────────────
//
// `nexis-ml serve` speaks a separate request/response NDJSON dialect (see
// PROTOCOL.md): a `ready` event, then one `prediction` or `error` per
// request. These lines arrive on the same stdout stream as training, so
// the store routes a session's batches here by sid and parses them with
// parseServeLine (NOT parseProtocolLine — the event sets is disjoint).

export type ServeMeta = {
  /** tabular: the feature columns + class labels, for the input form. */
  features?: string[];
  classes?: string[];
  task?: string;
  vocab?: number;
  context?: number;
};

export type ServeEvent =
  | {
      ev: "ready";
      run?: string;
      template?: string;
      device?: string | null;
      meta?: ServeMeta;
      protocol?: number;
    }
  | { ev: "prediction"; input?: unknown; output?: unknown; continuation?: string }
  | { ev: "error"; msg: string };

const SERVE_EVENTS = new Set(["ready", "prediction", "error"]);

/** Parse one serve NDJSON line. Same forgiving contract as
 *  parseProtocolLine: null for anything not understood, never throws. */
export function parseServeLine(line: string): ServeEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const ev = (obj as { ev?: unknown }).ev;
  if (typeof ev !== "string" || !SERVE_EVENTS.has(ev)) return null;
  if (ev === "error" && typeof (obj as { msg?: unknown }).msg !== "string") {
    return null;
  }
  return obj as ServeEvent;
}

export function parseProtocolLines(lines: string[]): MlEvent[] {
  const out: MlEvent[] = [];
  for (const line of lines) {
    const ev = parseProtocolLine(line);
    if (ev) out.push(ev);
  }
  return out;
}

/** A generated-text snapshot (the `textgen` payoff), tagged with the
 *  pass it was produced after. */
export type MlSample = { epoch: number | null; text: string };

/**
 * Walk events in order, attaching each `sample` to the most recent epoch
 * seen (from `metric.epoch` or an `epoch` event — `sample` events carry
 * no epoch of their own). Newest samples last; capped at `max` by
 * dropping the oldest. `base`/`startEpoch` let the live path fold a new
 * batch into the samples it already has without re-scanning history.
 */
export function collectSamples(
  events: MlEvent[],
  max: number,
  base: MlSample[] = [],
  startEpoch: number | null = null,
): MlSample[] {
  const out = base.slice();
  let epoch = startEpoch;
  for (const ev of events) {
    if (ev.ev === "metric") {
      if (typeof ev.epoch === "number") epoch = ev.epoch;
    } else if (ev.ev === "epoch") {
      epoch = ev.epoch;
    } else if (ev.ev === "sample") {
      out.push({ epoch, text: String(ev.output ?? "") });
      if (out.length > max) out.shift();
    }
  }
  return out;
}

/** A file artifact referenced in the stream, tagged with its epoch. */
export type ArtifactRef = { path: string; epoch: number | null };

/**
 * The most recent `confusion-matrix` artifact in the stream (the
 * `tabular`/`image` templates write one per eval), tagged with the epoch
 * it belongs to — tracked the same way `collectSamples` tracks samples,
 * since artifact events carry no epoch of their own.
 */
export function latestArtifact(
  events: MlEvent[],
  kind: string,
  startEpoch: number | null = null,
): ArtifactRef | null {
  let epoch = startEpoch;
  let found: ArtifactRef | null = null;
  for (const ev of events) {
    if (ev.ev === "metric") {
      if (typeof ev.epoch === "number") epoch = ev.epoch;
    } else if (ev.ev === "epoch") {
      epoch = ev.epoch;
    } else if (ev.ev === "artifact" && ev.kind === kind) {
      found = { path: ev.path, epoch };
    }
  }
  return found;
}

/** Convenience wrapper for the `tabular`/`image` per-eval confusion matrix. */
export function latestConfusionMatrix(
  events: MlEvent[],
  startEpoch: number | null = null,
): ArtifactRef | null {
  return latestArtifact(events, "confusion-matrix", startEpoch);
}
