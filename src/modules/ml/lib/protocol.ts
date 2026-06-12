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

export function parseProtocolLines(lines: string[]): MlEvent[] {
  const out: MlEvent[] = [];
  for (const line of lines) {
    const ev = parseProtocolLine(line);
    if (ev) out.push(ev);
  }
  return out;
}
