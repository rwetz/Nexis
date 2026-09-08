// Browser-side benchmark simulator. Used when the app runs outside Tauri
// (e.g. `pnpm dev` in a plain browser / preview) so the entire UI is testable.
// It mirrors the shapes the Rust `Simulated` backend produces.

import {
  type BackendId,
  type BenchConfig,
  type BenchJob,
  type BenchMetrics,
  type BenchProgress,
  type BenchResult,
  type ModelInfo,
} from "./types";

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Relative throughput character per backend (× model-size baseline).
const BACKEND_FACTOR: Record<BackendId, number> = {
  nexis: 1.18, // the hero engine — tuned wgpu/ndarray path
  onnx: 1.0,
  llama: 0.92,
  sim: 0.8,
};

export function simulateMetrics(
  model: ModelInfo,
  backendId: BackendId,
  config: BenchConfig,
): BenchMetrics {
  const rand = rng(hashStr(model.id + backendId + config.task));
  const sizeMB = Math.max(8, model.sizeBytes / 1e6);

  // Smaller models run faster; clamp into a believable band.
  const baseTps = Math.min(2400, Math.max(14, 9000 / Math.sqrt(sizeMB)));
  const factor = BACKEND_FACTOR[backendId] ?? 1;
  const noise = 0.9 + rand() * 0.2;
  const tokensPerSec = baseTps * factor * noise;

  const firstTokenMs = 18 + sizeMB * 0.22 * (1 / factor) + rand() * 20;

  const perTokenMs = 1000 / tokensPerSec;
  const meanLatency =
    config.task === "generation"
      ? firstTokenMs + perTokenMs * config.maxTokens
      : (perTokenMs * Math.max(8, config.promptTokens) * config.batchSize) / 4;

  // Per-run samples with light jitter.
  const samplesMs = Array.from({ length: config.runs }, () => {
    const jitter = 1 + (rand() - 0.5) * 0.12;
    return meanLatency * jitter;
  });
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const pct = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

  const peakMemBytes = model.sizeBytes * (1.15 + rand() * 0.5) + 180e6;

  const accuracy =
    config.task === "classification"
      ? 0.78 + rand() * 0.19 + (backendId === "nexis" ? 0.01 : 0)
      : config.task === "embedding"
        ? null
        : null;

  return {
    tokensPerSec,
    firstTokenMs,
    latencyMeanMs: samplesMs.reduce((a, b) => a + b, 0) / samplesMs.length,
    latencyP50Ms: pct(0.5),
    latencyP95Ms: pct(0.95),
    peakMemBytes,
    accuracy,
    samplesMs,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drive a job through the same lifecycle the Rust backend uses, calling the
 * provided callbacks. Returns when all cells are done.
 */
export async function runJobSimulated(
  job: BenchJob,
  onProgress: (p: BenchProgress) => void,
  onResult: (r: BenchResult) => void,
  shouldCancel: () => boolean,
): Promise<void> {
  for (const model of job.models) {
    for (const backendId of job.backendIds) {
      if (shouldCancel()) return;
      const base = { jobId: job.jobId, modelId: model.id, backendId };

      onProgress({ ...base, phase: "loading", current: 0, total: job.config.runs });
      await sleep(180 + Math.random() * 320);

      for (let w = 0; w < job.config.warmup; w++) {
        if (shouldCancel()) return;
        onProgress({ ...base, phase: "warmup", current: 0, total: job.config.runs });
        await sleep(120);
      }

      const metrics = simulateMetrics(model, backendId, job.config);
      for (let i = 0; i < job.config.runs; i++) {
        if (shouldCancel()) return;
        onProgress({
          ...base,
          phase: "measuring",
          current: i + 1,
          total: job.config.runs,
          tokensPerSec: metrics.tokensPerSec * (0.95 + Math.random() * 0.1),
        });
        await sleep(90 + Math.random() * 80);
      }

      onResult({
        id: `${job.jobId}-${model.id}-${backendId}`,
        modelId: model.id,
        backendId,
        status: "done",
        metrics,
        finishedAt: new Date().toISOString(),
        simulated: true,
      });
      onProgress({ ...base, phase: "done", current: job.config.runs, total: job.config.runs });
    }
  }
}

// ── Demo seed data (used in browser mode so the app isn't empty) ─────────────

export const DEMO_MODELS: ModelInfo[] = [
  {
    id: "demo-llama-3-8b",
    name: "Llama-3-8B-Instruct.Q4_K_M.gguf",
    path: "C:/models/Llama-3-8B-Instruct.Q4_K_M.gguf",
    format: "gguf",
    sizeBytes: 4_920_000_000,
    task: "generation",
    paramsLabel: "8B",
    quant: "Q4_K_M",
    arch: "llama",
    contextLength: 8192,
    addedAt: new Date(Date.now() - 86400e3).toISOString(),
  },
  {
    id: "demo-phi-3-mini",
    name: "Phi-3-mini-4k-instruct.Q5_K_M.gguf",
    path: "C:/models/Phi-3-mini-4k-instruct.Q5_K_M.gguf",
    format: "gguf",
    sizeBytes: 2_820_000_000,
    task: "generation",
    paramsLabel: "3.8B",
    quant: "Q5_K_M",
    arch: "phi3",
    contextLength: 4096,
    addedAt: new Date(Date.now() - 3600e3).toISOString(),
  },
  {
    id: "demo-distilbert-sst2",
    name: "distilbert-sst2.onnx",
    path: "C:/models/distilbert-sst2.onnx",
    format: "onnx",
    sizeBytes: 268_000_000,
    task: "classification",
    paramsLabel: "66M",
    quant: null,
    addedAt: new Date(Date.now() - 7200e3).toISOString(),
  },
  {
    id: "demo-minilm-embed",
    name: "all-MiniLM-L6-v2.onnx",
    path: "C:/models/all-MiniLM-L6-v2.onnx",
    format: "onnx",
    sizeBytes: 90_000_000,
    task: "embedding",
    paramsLabel: "22M",
    quant: null,
    addedAt: new Date(Date.now() - 172800e3).toISOString(),
  },
];
