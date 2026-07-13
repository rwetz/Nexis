// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * ML suite plugin — the in-app half of the Nexis ML Suite (ML_SUITE.md).
 *
 * Contributes the training status-bar pill and a command to open the ML
 * panel, and wires the engine's Tauri event stream into the ML store.
 * The panel itself lives in the sidebar rail ("ml" view), following the
 * same convention as Tests/Build/Database.
 */
import type { Plugin } from "@/lib/plugins/types";
import { combineDisposables } from "@/lib/plugins/types";
import { createElement } from "react";
// Import from the concrete files, not the "@/modules/ml" barrel — the barrel
// re-exports MlPanel (2k+ lines), which would drag the whole panel into the
// main chunk and defeat App.tsx's lazy `import("@/modules/ml/MlPanel")`.
import { MlStatusPill } from "@/modules/ml/MlStatusPill";
import { initMlSubscriptions } from "@/modules/ml/store";

export const mlPlugin: Plugin = {
  id: "nexis.ml",
  name: "ML Suite",

  activate(api) {
    const unsubscribe = initMlSubscriptions();

    return combineDisposables(
      { dispose: unsubscribe },
      api.registerStatusBarItem({
        id: "nexis.ml:training-pill",
        side: "right",
        priority: 95,
        render: () => createElement(MlStatusPill),
      }),
      api.registerCommand({
        id: "nexis.ml:open-panel",
        title: "ML: Open Runs Panel",
        handler: () => {
          window.dispatchEvent(
            new CustomEvent("nexis:open-sidebar-view", { detail: "ml" }),
          );
        },
      }),
    );
  },
};
