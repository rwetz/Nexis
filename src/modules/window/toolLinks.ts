// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Links between the three ML tools: Synapse (train and try), Pulse (time),
 * and Epoch (explore data, configs and past runs; a companion app).
 *
 * Synapse and Pulse are Nexis windows, so a link between them asks the main
 * window to open the other tool with launch parameters — the same route the
 * title bar takes, so the workspace root rides along (toolWindowHost.ts).
 * Epoch is its own app: Nexis hands it a `nexis-epoch://` link through
 * modules/epoch.rs, which finds the running Epoch or starts one.
 *
 * Launch parameters each tool understands:
 * - `ml-lab` (Synapse): `project` (folder), `run` (run id)
 * - `benchmark` (Pulse): `model` (path to an .onnx/.gguf file)
 * Links from Epoch arrive as `nexis://<tool>?...` with the same parameters
 * (window/deepLinks.ts).
 */

import { toast } from "sonner";
import { TOOL_NAMES } from "@/lib/toolNames";
import { openFiles } from "@/platform/dialogs";
import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setEpochPath } from "@/modules/settings/store";
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

const epochOpenCommand = defineCommand<
  { project: string; run: string | null; dataset: string | null; custom: string | null },
  "sent" | "launched"
>("epoch_open", "host");

export type EpochTarget = { project: string; run?: string; dataset?: string };

/** Show a project (and maybe one run or dataset in it) in Epoch. */
export async function openInEpoch(target: EpochTarget): Promise<void> {
  const custom = usePreferencesStore.getState().epochPath;
  try {
    const how = await hostIpc.call(epochOpenCommand, {
      project: target.project,
      run: target.run ?? null,
      dataset: target.dataset ?? null,
      custom,
    });
    if (how === "launched") toast(`Starting ${TOOL_NAMES.epoch}…`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("not-found")) {
      toast.error(`${TOOL_NAMES.epoch} isn't installed here`, {
        description: `Install Nexis Epoch, or point Nexis at nexis-epoch${navigator.userAgent.includes("Windows") ? ".exe" : ""} if it lives somewhere unusual.`,
        action: { label: "Locate…", onClick: () => void locateEpoch(target) },
      });
      return;
    }
    toast.error(`Could not open ${TOOL_NAMES.epoch}`, { description: message });
  }
}

/** Ask for the Epoch binary, remember it, and retry the link. */
async function locateEpoch(retry: EpochTarget): Promise<void> {
  const picked = await openFiles({ multiple: false });
  const path = Array.isArray(picked) ? picked[0] : picked;
  if (!path) return;
  await setEpochPath(path);
  await openInEpoch(retry);
}
