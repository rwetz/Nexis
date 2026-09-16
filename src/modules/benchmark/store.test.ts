// @vitest-environment jsdom
import "@/test/dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { BenchProgress, BenchResult } from "./lib/types";

const listeners = vi.hoisted(() => ({
  progress: null as ((value: BenchProgress) => void) | null,
  result: null as ((value: BenchResult) => void) | null,
}));

vi.mock("./lib/api", () => ({
  cancelBenchmark: vi.fn(async () => {}),
  isRunning: vi.fn(async () => false),
  listBackends: vi.fn(async () => []),
  probeLlama: vi.fn(async () => ({ available: false })),
  runBenchmark: vi.fn(async () => {}),
  onProgress: (callback: (value: BenchProgress) => void) => {
    listeners.progress = callback;
    return () => { listeners.progress = null; };
  },
  onResult: (callback: (value: BenchResult) => void) => {
    listeners.result = callback;
    return () => { listeners.result = null; };
  },
}));

import { useBenchStore } from "./store";
import { DEFAULT_CONFIG } from "./lib/types";

beforeEach(() => {
  localStorage.clear();
  useBenchStore.setState(useBenchStore.getInitialState(), true);
});

it("keeps benchmark event ownership outside panel mounts", () => {
  useBenchStore.setState({
    jobId: "job-1",
    running: true,
    run: {
      id: "job-1",
      createdAt: "2026-09-15T00:00:00.000Z",
      config: DEFAULT_CONFIG,
      matrix: [{ modelId: "model-1", backendId: "onnx" }],
      results: [],
    },
  });

  listeners.progress?.({
    jobId: "job-1",
    modelId: "model-1",
    backendId: "onnx",
    phase: "measuring",
    current: 1,
    total: 2,
  });
  expect(useBenchStore.getState().progress["model-1::onnx"]?.current).toBe(1);

  listeners.result?.({
    id: "result-1",
    modelId: "model-1",
    backendId: "onnx",
    status: "done",
    finishedAt: "2026-09-15T00:00:01.000Z",
  });
  const state = useBenchStore.getState();
  expect(state.running).toBe(false);
  expect(state.run?.results).toHaveLength(1);
  expect(state.history[0]?.id).toBe("job-1");
});
