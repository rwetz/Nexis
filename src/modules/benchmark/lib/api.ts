// Single boundary between the React app and the benchmark engine.
// In Tauri it uses `invoke` + window events; in a plain browser it falls back
// to the in-process simulator so the UI is fully functional either way.

import { IS_TAURI, IS_WINDOWS } from "./platform";
import {
  type BackendInfo,
  type LlamaProbe,
  type BenchJob,
  type BenchProgress,
  type BenchResult,
  type BenchRun,
  type ModelFormat,
  type ModelInfo,
  type TaskType,
} from "./types";
import { DEMO_MODELS, runJobSimulated } from "./mockEngine";

type ProgressCb = (p: BenchProgress) => void;
type ResultCb = (r: BenchResult) => void;

const progressCbs = new Set<ProgressCb>();
const resultCbs = new Set<ResultCb>();
const cancelled = new Set<string>();

export function onProgress(cb: ProgressCb): () => void {
  progressCbs.add(cb);
  return () => progressCbs.delete(cb);
}
export function onResult(cb: ResultCb): () => void {
  resultCbs.add(cb);
  return () => resultCbs.delete(cb);
}
const emitProgress = (p: BenchProgress) => progressCbs.forEach((cb) => cb(p));
const emitResult = (r: BenchResult) => resultCbs.forEach((cb) => cb(r));

// Wire Tauri events → local dispatch (once).
if (IS_TAURI) {
  void import("@tauri-apps/api/event").then(({ listen }) => {
    void listen<BenchProgress>("bench://progress", (e) => emitProgress(e.payload));
    void listen<BenchResult>("bench://result", (e) => emitResult(e.payload));
  });
}

// ── Static fallbacks (browser mode) ──────────────────────────────────────────

const FALLBACK_BACKENDS: BackendInfo[] = [
  {
    id: "nexis",
    label: "nexis-ml-rs",
    description: "Python-free burn engine (wgpu / ndarray). The home team.",
    available: true,
    device: "auto",
    version: "0.6.0",
    supports: ["onnx"],
  },
  {
    id: "onnx",
    label: "ONNX Runtime",
    description: "Microsoft ONNX Runtime via the ort crate.",
    available: true,
    device: "cpu",
    version: "1.20",
    supports: ["onnx"],
  },
  {
    id: "llama",
    label: "llama.cpp",
    description: "GGUF inference via llama.cpp (requires cmake build).",
    available: false,
    device: "cpu",
    version: null,
    supports: ["gguf"],
  },
  {
    id: "sim",
    label: "Simulated",
    description: "Deterministic synthetic backend for UI / protocol testing.",
    available: true,
    device: "cpu",
    version: "1.0",
    supports: ["onnx", "gguf"],
  },
];

// ── Public API ───────────────────────────────────────────────────────────────

export async function listBackends(): Promise<BackendInfo[]> {
  if (!IS_TAURI) return FALLBACK_BACKENDS;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<BackendInfo[]>("list_backends");
}

/** Resolve dropped/added file paths into model entries. */
export async function scanModels(paths: string[]): Promise<ModelInfo[]> {
  if (!IS_TAURI) return paths.map((p) => deriveModelInfo(p));
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ModelInfo[]>("scan_models", { paths });
}

/** Open the native file picker and return the chosen models. */
export async function pickModels(): Promise<ModelInfo[]> {
  if (!IS_TAURI) {
    // Browser mode: surface the demo set so the picker isn't a dead end.
    return DEMO_MODELS;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({
    multiple: true,
    filters: [{ name: "Models", extensions: ["onnx", "gguf"] }],
  });
  if (!selection) return [];
  const paths = Array.isArray(selection) ? selection : [selection];
  return scanModels(paths);
}

/** Validate a llama-bench binary (or auto-detect on PATH when path is null). */
export async function probeLlama(path: string | null): Promise<LlamaProbe> {
  if (!IS_TAURI) return { available: false, version: null, path: null };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LlamaProbe>("probe_llama", { path });
}

/** Open a file picker to locate the llama-bench executable. */
export async function pickLlamaBench(): Promise<string | null> {
  if (!IS_TAURI) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const sel = await open({
    multiple: false,
    filters: IS_WINDOWS ? [{ name: "Executable", extensions: ["exe"] }] : undefined,
  });
  return typeof sel === "string" ? sel : null;
}

export async function runBenchmark(job: BenchJob): Promise<void> {
  cancelled.delete(job.jobId);
  if (!IS_TAURI) {
    // Fire-and-forget; the simulator streams via the same callbacks.
    void runJobSimulated(job, emitProgress, emitResult, () =>
      cancelled.has(job.jobId),
    );
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("run_benchmark", { job });
}

export async function cancelBenchmark(jobId: string): Promise<void> {
  cancelled.add(jobId);
  if (!IS_TAURI) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cancel_benchmark", { jobId });
}

async function saveText(
  contents: string,
  filename: string,
  ext: string,
  mime: string,
): Promise<void> {
  if (!IS_TAURI) {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: filename,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_text_file", { path, contents });
}

export function exportRunCsv(run: BenchRun, models: ModelInfo[]): Promise<void> {
  return saveText(runToCsv(run, models), `nexis-benchmark-${run.id}.csv`, "csv", "text/csv");
}

export function exportRunJson(run: BenchRun, models: ModelInfo[]): Promise<void> {
  const payload = {
    tool: "nexis-benchmark",
    exportedAt: new Date().toISOString(),
    run,
    models: models.filter((m) => run.matrix.some((c) => c.modelId === m.id)),
  };
  return saveText(
    JSON.stringify(payload, null, 2),
    `nexis-benchmark-${run.id}.json`,
    "json",
    "application/json",
  );
}

/** Copy a Markdown results table to the clipboard. Returns success. */
export async function copyRunMarkdown(run: BenchRun, models: ModelInfo[]): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(runToMarkdown(run, models));
    return true;
  } catch {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseName(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

/** Derive a ModelInfo from a file path using filename heuristics. */
export function deriveModelInfo(path: string, sizeBytes = 0): ModelInfo {
  const name = baseName(path);
  const lower = name.toLowerCase();
  const format: ModelFormat = lower.endsWith(".gguf") ? "gguf" : "onnx";

  let task: TaskType = "generation";
  if (/(embed|minilm|bge|gte|e5|sentence)/.test(lower)) task = "embedding";
  else if (/(bert|sst|classif|sentiment|nli|distil)/.test(lower) && format === "onnx")
    task = "classification";
  else if (format === "onnx") task = "classification";

  const quant = format === "gguf" ? (name.match(/Q\d[_A-Za-z0-9]*/)?.[0] ?? null) : null;
  const params = name.match(/(\d+(?:\.\d+)?)\s*([bBmM])(?![a-z])/);
  const paramsLabel = params ? `${params[1]}${params[2].toUpperCase()}` : null;

  return {
    id: `m-${hashPath(path)}`,
    name,
    path,
    format,
    sizeBytes,
    task,
    paramsLabel,
    quant,
    addedAt: new Date().toISOString(),
  };
}

function hashPath(p: string): string {
  let h = 2166136261;
  for (let i = 0; i < p.length; i++) {
    h ^= p.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function runToCsv(run: BenchRun, models: ModelInfo[]): string {
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id;
  const head = [
    "model",
    "backend",
    "status",
    "tokens_per_sec",
    "first_token_ms",
    "latency_mean_ms",
    "latency_p50_ms",
    "latency_p95_ms",
    "peak_mem_mb",
    "accuracy",
  ].join(",");
  const rows = run.results.map((r) => {
    const m = r.metrics;
    return [
      `"${modelName(r.modelId)}"`,
      r.backendId,
      r.status,
      m?.tokensPerSec?.toFixed(2) ?? "",
      m?.firstTokenMs?.toFixed(2) ?? "",
      m?.latencyMeanMs?.toFixed(2) ?? "",
      m?.latencyP50Ms?.toFixed(2) ?? "",
      m?.latencyP95Ms?.toFixed(2) ?? "",
      m ? (m.peakMemBytes / 1e6).toFixed(1) : "",
      m?.accuracy != null ? m.accuracy.toFixed(4) : "",
    ].join(",");
  });
  return [`# Nexis Benchmark — run ${run.id} — ${run.createdAt}`, head, ...rows].join("\n");
}

export function runToMarkdown(run: BenchRun, models: ModelInfo[]): string {
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id;
  const head = "| Model | Backend | tok/s | TTFT (ms) | mean (ms) | p95 (ms) | mem (MB) | acc |";
  const sep = "| --- | --- | --: | --: | --: | --: | --: | --: |";
  const rows = run.results.map((r) => {
    const m = r.metrics;
    const cells = [
      modelName(r.modelId),
      r.backendId,
      m ? m.tokensPerSec.toFixed(1) : "—",
      m ? m.firstTokenMs.toFixed(2) : "—",
      m ? m.latencyMeanMs.toFixed(2) : "—",
      m ? m.latencyP95Ms.toFixed(2) : "—",
      m ? (m.peakMemBytes / 1e6).toFixed(0) : "—",
      m?.accuracy != null ? `${(m.accuracy * 100).toFixed(1)}%` : "—",
    ];
    return `| ${cells.join(" | ")} |`;
  });
  return [`**Nexis Benchmark** — ${new Date(run.createdAt).toLocaleString()}`, "", head, sep, ...rows].join(
    "\n",
  );
}
