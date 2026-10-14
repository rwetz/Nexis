// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { TOOL_NAMES } from "@/lib/toolNames";
import { openInEpoch } from "@/modules/window/toolLinks";
import type { CapabilityDefinition } from "@/workbench/capability";

/**
 * Nexis Epoch beside Synapse and Pulse in the title bar. Epoch is a companion
 * app (github.com/rwetz/nexis-epoch), not a Nexis window: the launcher hands
 * it the open workspace (or the project a link names) and Epoch opens on it.
 * Synapse and Pulse link into it per project and per run (window/toolLinks.ts).
 */
export const epochCapability: CapabilityDefinition = {
  id: "epoch.companion",
  panels: [],
  toolWindows: [{
    id: "epoch",
    label: TOOL_NAMES.epoch,
    title: `${TOOL_NAMES.epoch} — Nexis`,
    icon: "clock",
    pack: "ml-lab",
    width: 0,
    render: () => null,
    launch: (params) => {
      const project = params.project ?? params.root;
      if (!project) return;
      void openInEpoch({ project, run: params.run, dataset: params.dataset });
    },
  }],
  commands: (context) => [{
    id: "epoch.open",
    title: `Open this workspace in ${TOOL_NAMES.epoch} (data, configs and past runs)`,
    category: "View",
    pack: "ml-lab",
    icon: "clock",
    keywords: ["epoch", "dataset", "duckdb", "sql", "experiments", "runs", "parquet", "csv"],
    handler: () => {
      const host = context();
      const root = host.workspace.snapshot().roots[0];
      if (!root) {
        host.notify("No workspace open", `Open a folder before showing it in ${TOOL_NAMES.epoch}.`);
        return;
      }
      void openInEpoch({ project: root });
    },
  }],
};
