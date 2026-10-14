import { type BackendId, type BenchResult, type TaskType } from "./types";

/**
 * What a result's numbers actually describe.
 *
 * ONNX Runtime, llama.cpp and the simulator run (or stand in for) the dropped
 * model. nexis-ml-rs cannot load an arbitrary model: it trains a standardized
 * synthetic workload (see `src-tauri/src/modules/benchmark/ml_engine.rs`), so
 * its throughput, latency and accuracy describe the engine, never the model in
 * that cell. Anything that names a model as a winner must skip those results.
 */
export const measuresModel = (r: Pick<BenchResult, "backendId">): boolean =>
  r.backendId !== "nexis";

export const ENGINE_WORKLOAD_LABEL = "Engine training throughput (synthetic workload)";

export interface ThroughputUnit {
  /** Compact unit for tight readouts, e.g. "inf/s". */
  short: string;
  /** Unit spelled out for values, headers and exports, e.g. "inferences/s". */
  long: string;
}

/**
 * The unit of `BenchMetrics.tokensPerSec`, which despite its name holds
 * whatever rate the backend measured: tokens for generation, input rows for
 * classification and embedding, training samples for nexis-ml-rs.
 */
export function throughputUnit(task: TaskType, backendId: BackendId): ThroughputUnit {
  if (backendId === "nexis") return { short: "samples/s", long: "samples/s" };
  if (task === "generation") return { short: "tok/s", long: "tok/s" };
  return { short: "inf/s", long: "inferences/s" };
}
