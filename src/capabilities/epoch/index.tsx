// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { TOOL_NAMES } from "@/lib/toolNames";
import { openInEpoch } from "@/modules/window/toolLinks";
import type { CapabilityDefinition } from "@/workbench/capability";

/**
 * Nexis Epoch beside Synapse and Pulse in the title bar: Epoch's own UI in a
 * Nexis window (`epoch.html`, src/windows/epoch.tsx), over the same
 * `tauri-plugin-epoch` backend as the standalone app. The launcher hands it
 * the workspace root, which Epoch opens as its project the first time; Synapse
 * and Pulse link into it per project and per run (window/toolLinks.ts).
 */
export const epochCapability: CapabilityDefinition = {
  id: "epoch.window",
  panels: [],
  toolWindows: [{
    id: "epoch",
    label: TOOL_NAMES.epoch,
    title: `${TOOL_NAMES.epoch} — Nexis`,
    icon: "clock",
    pack: "ml-lab",
    // Epoch's Studio is five panels wide; it is laid out for a big window.
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    page: "epoch.html",
    render: () => null,
  }],
  commands: (context) => [{
    id: "epoch.open",
    title: `Open this workspace in ${TOOL_NAMES.epoch} (data, configs and past runs)`,
    category: "View",
    pack: "ml-lab",
    icon: "clock",
    keywords: ["epoch", "dataset", "duckdb", "sql", "experiments", "runs", "parquet", "csv", "onnx", "safetensors"],
    handler: () => {
      const host = context();
      const root = host.workspace.snapshot().roots[0];
      if (!root) {
        host.notify("No workspace open", `Open a folder before showing it in ${TOOL_NAMES.epoch}.`);
        return;
      }
      openInEpoch({ project: root });
    },
  }],
};
