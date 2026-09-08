// ── Domain model ─────────────────────────────────────────────────────────────
// These mirror the Rust structs in src-tauri/src/domain.rs (serde camelCase).

export type ModelFormat = "onnx" | "gguf";

export type TaskType = "generation" | "classification" | "embedding";

export const TASK_LABELS: Record<TaskType, string> = {
  generation: "Text Generation",
  classification: "Classification",
  embedding: "Embedding",
};

export type BackendId = "nexis" | "onnx" | "llama" | "sim";

export type DeviceKind = "cpu" | "gpu" | "auto";

export interface ModelInfo {
  id: string;
  name: string;
  path: string;
  format: ModelFormat;
  sizeBytes: number;
  task: TaskType;
  /** e.g. "7B", "335M" — best-effort, may be undefined. */
  paramsLabel?: string | null;
  /** GGUF quantization, e.g. "Q4_K_M". */
  quant?: string | null;
  /** Architecture from the GGUF header (e.g. "llama", "phi3"). */
  arch?: string | null;
  /** Trained context length from the GGUF header. */
  contextLength?: number | null;
  addedAt: string; // ISO timestamp
}

/** A saved benchmark protocol the user can re-apply. */
export interface Preset {
  id: string;
  name: string;
  config: BenchConfig;
}

export interface BackendInfo {
  id: BackendId;
  label: string;
  description: string;
  /** Whether this backend is wired up and usable on this machine. */
  available: boolean;
  device: DeviceKind;
  version?: string | null;
  /** Model formats this backend can load. */
  supports: ModelFormat[];
}

// ── Benchmark configuration ──────────────────────────────────────────────────

export interface BenchConfig {
  task: TaskType;
  /** Measured runs (after warm-up). */
  runs: number;
  /** Warm-up runs that are discarded. */
  warmup: number;
  /** Prompt length in tokens (generation). */
  promptTokens: number;
  /** Tokens to generate per run (generation). */
  maxTokens: number;
  /** Batch size (classification / embedding). */
  batchSize: number;
}

export const DEFAULT_CONFIG: BenchConfig = {
  task: "generation",
  runs: 5,
  warmup: 1,
  promptTokens: 128,
  maxTokens: 256,
  batchSize: 1,
};

// ── Live progress + results ──────────────────────────────────────────────────

export type RunPhase =
  | "queued"
  | "loading"
  | "warmup"
  | "measuring"
  | "done"
  | "error";

export const PHASE_LABELS: Record<RunPhase, string> = {
  queued: "Queued",
  loading: "Loading model",
  warmup: "Warming up",
  measuring: "Measuring",
  done: "Done",
  error: "Failed",
};

/** Streamed many times during a job, keyed by (modelId, backendId). */
export interface BenchProgress {
  jobId: string;
  modelId: string;
  backendId: BackendId;
  phase: RunPhase;
  /** 0..total completed measured runs. */
  current: number;
  total: number;
  message?: string | null;
  /** Live throughput estimate while measuring. */
  tokensPerSec?: number | null;
}

export interface BenchMetrics {
  tokensPerSec: number;
  firstTokenMs: number;
  latencyMeanMs: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  peakMemBytes: number;
  /** 0..1, only for classification with a labelled dataset. */
  accuracy?: number | null;
  /** Per-run total latency samples (ms), for the distribution view. */
  samplesMs: number[];
}

export interface BenchResult {
  id: string;
  modelId: string;
  backendId: BackendId;
  status: "done" | "error";
  metrics?: BenchMetrics | null;
  error?: string | null;
  finishedAt: string;
  /** True when the numbers are synthetic (no real engine wired yet). */
  simulated?: boolean;
  /** How the metrics were obtained (e.g. real engine throughput vs inference). */
  note?: string | null;
}

export interface BenchRun {
  id: string;
  createdAt: string;
  config: BenchConfig;
  /** (modelId, backendId) pairs that were requested. */
  matrix: { modelId: string; backendId: BackendId }[];
  results: BenchResult[];
}

/** A request to run the benchmark over a model × backend matrix. */
export interface BenchJob {
  jobId: string;
  config: BenchConfig;
  models: ModelInfo[];
  backendIds: BackendId[];
  /** Located `llama-bench` binary for the llama.cpp backend. */
  llamaBenchPath?: string | null;
}

export interface LlamaProbe {
  available: boolean;
  version?: string | null;
  path?: string | null;
}

export const cellKey = (modelId: string, backendId: BackendId) =>
  `${modelId}::${backendId}`;
