import { type BackendId } from "./types";

/** CSS color value for each backend — used in charts, chips, legends. */
export const BACKEND_COLOR: Record<BackendId, string> = {
  nexis: "var(--accent-nexis)",
  onnx: "var(--accent-onnx)",
  llama: "var(--accent-llama)",
  sim: "var(--accent-sim)",
};

/** Tailwind text-color class (relies on @theme color mappings in globals.css). */
export const BACKEND_TEXT: Record<BackendId, string> = {
  nexis: "text-nexis",
  onnx: "text-onnx",
  llama: "text-llama",
  sim: "text-sim",
};

export const BACKEND_SHORT: Record<BackendId, string> = {
  nexis: "nexis-ml-rs",
  onnx: "ONNX RT",
  llama: "llama.cpp",
  sim: "Simulated",
};
