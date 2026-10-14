// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useEffect } from "react";
import { useToolWindowLaunch } from "@/modules/window/toolWindowHost";
import { BenchmarkPanel } from "./BenchmarkPanel";
import { scanModels } from "./lib/api";
import { useBenchStore } from "./store";

/**
 * Pulse in its own window. A link from Synapse or Epoch names a model file
 * (`model=...`): add it to the library, select it, and match the workload to
 * what the model does, so "Run benchmark" is the only click left.
 */
export function PulseWindow() {
  const { params, opens } = useToolWindowLaunch("benchmark");
  useEffect(() => {
    const path = params.model;
    if (!path) return;
    void scanModels([path])
      .then((found) => {
        if (found.length === 0) return;
        const store = useBenchStore.getState();
        store.addModels(found);
        const task = found[0]?.task;
        if (task) store.setConfig({ task });
      })
      .catch(() => {});
  }, [params, opens]);
  return <BenchmarkPanel />;
}
