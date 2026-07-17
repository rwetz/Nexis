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
import { usePreferencesStore } from "@/modules/settings/preferences";

export function PluginHost() {
  // Order-independent key so toggling a pack re-runs activation while an
  // unrelated prefs write doesn't. Pack-less plugins always activate.
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const packsKey = [...enabledPacks].sort().join(",");

  useEffect(() => {
    const packs = usePreferencesStore.getState().enabledPacks;
    const api = createPluginAPI();
    const disposables: Disposable[] = [];

    for (const plugin of ALL_PLUGINS as readonly Plugin[]) {
      if (plugin.pack && !packs.includes(plugin.pack)) continue;
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
    // packsKey stands in for enabledPacks (read via getState inside) so a
    // same-content array from hydration doesn't churn every plugin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packsKey]);

  return null;
}
