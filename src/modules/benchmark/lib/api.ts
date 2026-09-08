// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Single boundary between the Benchmark panel and the Rust harness.
 *
 * The standalone app carried a second implementation of everything here — an
 * in-process simulator plus a demo model set — so the UI stayed usable in a
 * plain browser with `pnpm dev`. That whole branch is gone. Nexis is always a
 * Tauri webview, so `IS_TAURI` was a constant `true` and every `if (!IS_TAURI)`
 * arm was dead code that still had to be kept honest against the real one.
 *
 * Exports go through `fs_write_file` rather than the app's old bespoke
 * `write_text_file` command: that one skipped the atomic staging and the WSL
 * rename fallback every other write in Nexis gets (pitfall #17).
 */

import { invoke } from "@tauri-apps/api/core";
import { IS_WINDOWS } from "@/lib/platform";
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

type ProgressCb = (p: BenchProgress) => void;
type ResultCb = (r: BenchResult) => void;

const progressCbs = new Set<ProgressCb>();
const resultCbs = new Set<ResultCb>();

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

// Wire Tauri events → local dispatch, once per module load. A run outlives the
// panel (the engine keeps working while the sidebar shows something else), so
// these listeners are deliberately not tied to a component lifecycle.
void import("@tauri-apps/api/event").then(({ listen }) => {
  void listen<BenchProgress>("bench://progress", (e) => emitProgress(e.payload));
  void listen<BenchResult>("bench://result", (e) => emitResult(e.payload));
});

// ── Public API ───────────────────────────────────────────────────────────────

export function listBackends(): Promise<BackendInfo[]> {
  return invoke<BackendInfo[]>("bench_list_backends");
}

/** Resolve dropped/added file paths into model entries. */
export function scanModels(paths: string[]): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>("bench_scan_models", { paths });
}

/** Open the native file picker and return the chosen models. */
export async function pickModels(): Promise<ModelInfo[]> {
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
export function probeLlama(path: string | null): Promise<LlamaProbe> {
  return invoke<LlamaProbe>("bench_probe_llama", { path });
}

/** Open a file picker to locate the llama-bench executable. */
export async function pickLlamaBench(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const sel = await open({
    multiple: false,
    filters: IS_WINDOWS ? [{ name: "Executable", extensions: ["exe"] }] : undefined,
  });
  return typeof sel === "string" ? sel : null;
}

export function runBenchmark(job: BenchJob): Promise<void> {
  return invoke("bench_run", { job });
}

export function cancelBenchmark(jobId: string): Promise<void> {
  return invoke("bench_cancel", { jobId });
}

/** Whether the harness still has this job registered. The panel asks on mount
 *  because a run survives the view being unmounted. */
export function isRunning(jobId: string): Promise<boolean> {
  return invoke<boolean>("bench_is_running", { jobId });
}

async function saveText(
  contents: string,
  filename: string,
  ext: string,
): Promise<void> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: filename,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return;
  // `source` tags the write in the fs event stream so the editor does not
  // treat an export as an external edit to a file it has open.
  await invoke("fs_write_file", { path, content: contents, source: "benchmark-export" });
}

export function exportRunCsv(run: BenchRun, models: ModelInfo[]): Promise<void> {
  return saveText(runToCsv(run, models), `nexis-benchmark-${run.id}.csv`, "csv");
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
