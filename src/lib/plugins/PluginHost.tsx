// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * PluginHost — activates all registered plugins on mount and disposes them
 * on unmount. Render this once, high up in the tree (inside App).
 */
import { useEffect } from "react";
import { createPluginAPI } from "./registry";
import type { Plugin, Disposable } from "./types";
import { ALL_PLUGINS } from "@/plugins";

export function PluginHost() {
  useEffect(() => {
    const api = createPluginAPI();
    const disposables: Disposable[] = [];

    for (const plugin of ALL_PLUGINS as readonly Plugin[]) {
      try {
        const result = plugin.activate(api);
        if (result) disposables.push(result);
      } catch (err) {
        console.error(`[plugin] Failed to activate "${plugin.id}":`, err);
      }
    }

    return () => {
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // ignore cleanup errors
        }
      }
    };
    // Plugins are constants — run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
