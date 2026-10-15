// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Links between the three ML tools: Synapse (train and try), Pulse (time),
 * and Epoch (explore data, configs, past runs and weight files).
 *
 * All three are Nexis windows, so a link asks the main window to open the
 * other tool with launch parameters, the same route the title bar takes, so
 * the workspace root rides along (toolWindowHost.ts). Epoch's window runs
 * Epoch's own UI (src/windows/epoch.tsx); the standalone Epoch app still
 * links to a running Nexis over the loopback channel (modules/links.rs).
 *
 * Launch parameters each tool understands:
 * - `ml-lab` (Synapse): `project` (folder), `run` (run id)
 * - `benchmark` (Pulse): `model` (path to an .onnx/.gguf file)
 * - `epoch`: `project` (folder), `run` (run id), `dataset` (file in it)
 * Links from Epoch arrive as `nexis://<tool>?...` with the same parameters
 * (window/deepLinks.ts).
 */

import { requestToolHostAction } from "./toolWindowHost";

export type MlToolId = "ml-lab" | "benchmark";

/** Open Synapse or Pulse from anywhere (main window or a tool window). */
export function openNexisTool(tool: MlToolId, params: Record<string, string> = {}): void {
  requestToolHostAction({ kind: "tool", tool, params });
}

/** The folder a file lives in, in whichever separator style the path uses. */
export function parentDir(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : path;
}

/** Join a project folder and a file name without doubling separators. */
export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

/** `model.onnx` beside a train.toml is how Synapse exports a project. */
export function synapseProjectOfModel(modelPath: string): string | null {
  const name = modelPath.slice(Math.max(modelPath.lastIndexOf("/"), modelPath.lastIndexOf("\\")) + 1);
  return name.toLowerCase() === "model.onnx" ? parentDir(modelPath) : null;
}

export type EpochTarget = { project: string; run?: string; dataset?: string };

/** Show a project (and maybe one run or dataset in it) in the Epoch window. */
export function openInEpoch(target: EpochTarget): void {
  const params: Record<string, string> = { project: target.project };
  if (target.run) params.run = target.run;
  if (target.dataset) params.dataset = target.dataset;
  requestToolHostAction({ kind: "tool", tool: "epoch", params });
}
