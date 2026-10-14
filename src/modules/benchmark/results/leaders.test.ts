import { describe, expect, it, vi } from "vitest";

// api.ts subscribes to Tauri events on load; the exporters under test are pure.
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
}));

import { runToCsv, runToMarkdown } from "@/modules/benchmark/lib/api";
import { measuresModel, throughputUnit } from "@/modules/benchmark/lib/provenance";
import {
  DEFAULT_CONFIG,
  type BackendId,
  type BenchResult,
  type BenchRun,
  type ModelInfo,
} from "@/modules/benchmark/lib/types";
import { pickLeaders } from "./leaders";
import { metricByKey } from "./metrics";

const model: ModelInfo = {
  id: "m1",
  name: "model.onnx",
  path: "/tmp/model.onnx",
  format: "onnx",
  sizeBytes: 4096,
  task: "classification",
  addedAt: "2026-10-14T00:00:00Z",
};

const result = (
  backendId: BackendId,
  metrics: Partial<NonNullable<BenchResult["metrics"]>>,
): BenchResult => ({
  id: `r-${backendId}`,
  modelId: model.id,
  backendId,
  status: "done",
  finishedAt: "2026-10-14T00:00:00Z",
  metrics: {
    tokensPerSec: 0,
    firstTokenMs: 0,
    latencyMeanMs: 0,
    latencyP50Ms: 0,
    latencyP95Ms: 0,
    peakMemBytes: 0,
    accuracy: null,
    samplesMs: [],
    ...metrics,
  },
});

// The run that prompted this: ONNX RT ran the real model, nexis-ml-rs
// trained its own synthetic task and reported 91.5K samples/s and 76.2%.
const onnx = result("onnx", {
  tokensPerSec: 21_276,
  firstTokenMs: 0.05,
  latencyMeanMs: 0.047,
  peakMemBytes: 18.5e6,
});
const nexis = result("nexis", {
  tokensPerSec: 91_500,
  firstTokenMs: 40,
  latencyMeanMs: 44.7,
  peakMemBytes: 120e6,
  accuracy: 0.762,
});

describe("measuresModel", () => {
  it("treats nexis-ml-rs as an engine workload, everything else as the model", () => {
    expect(measuresModel(nexis)).toBe(false);
    expect(measuresModel(onnx)).toBe(true);
    expect(measuresModel({ backendId: "llama" })).toBe(true);
  });
});

describe("throughputUnit", () => {
  it("matches the task and backend", () => {
    expect(throughputUnit("generation", "llama").long).toBe("tok/s");
    expect(throughputUnit("classification", "onnx").long).toBe("inferences/s");
    expect(throughputUnit("embedding", "onnx").long).toBe("inferences/s");
    expect(throughputUnit("classification", "nexis").long).toBe("samples/s");
    expect(throughputUnit("generation", "nexis").long).toBe("samples/s");
  });

  it("drives the throughput metric's formatting", () => {
    const tp = metricByKey("tokensPerSec");
    expect(tp.format(21_276, "classification", "onnx")).toBe("21.3K inferences/s");
    expect(tp.format(91_500, "classification", "nexis")).toBe("91.5K samples/s");
    expect(tp.format(42, "generation", "llama")).toBe("42 tok/s");
  });
});

describe("pickLeaders", () => {
  it("never credits a model with nexis-ml-rs workload numbers", () => {
    const leaders = pickLeaders([onnx, nexis], [model], "classification");
    expect(leaders.every((l) => l.backendId === "onnx")).toBe(true);
    // ONNX reported no accuracy, so there is no "Most accurate" tile at all
    // rather than one carrying the synthetic workload's 76.2%.
    expect(leaders.find((l) => l.label === "Most accurate")).toBeUndefined();
    expect(leaders.find((l) => l.label === "Fastest")?.value).toBe("21.3K inferences/s");
  });

  it("has no leaders when only nexis-ml-rs ran", () => {
    expect(pickLeaders([nexis], [model], "classification")).toEqual([]);
  });
});

describe("exports", () => {
  const run: BenchRun = {
    id: "run1",
    createdAt: "2026-10-14T00:00:00Z",
    config: { ...DEFAULT_CONFIG, task: "classification" },
    matrix: [
      { modelId: model.id, backendId: "onnx" },
      { modelId: model.id, backendId: "nexis" },
    ],
    results: [onnx, nexis],
  };

  it("CSV states the unit and what each row measures", () => {
    const [, head, onnxRow, nexisRow] = runToCsv(run, [model]).split("\n");
    expect(head.endsWith("throughput_unit,measures")).toBe(true);
    expect(onnxRow.endsWith("inferences/s,model")).toBe(true);
    expect(nexisRow.endsWith("samples/s,engine_synthetic_workload")).toBe(true);
  });

  it("Markdown does not attribute the nexis-ml-rs row to the model", () => {
    const md = runToMarkdown(run, [model]);
    expect(md).not.toContain("tok/s");
    const nexisLine = md.split("\n").find((l) => l.includes("nexis"))!;
    expect(nexisLine).not.toContain("model.onnx");
    expect(nexisLine).toContain("samples/s");
  });
});
