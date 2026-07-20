// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { usePluginRegistry } from "@/lib/plugins/registry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { LayersIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PackGatePlaceholder } from "./PackGatePlaceholder";
import { resolvePluginView } from "./pluginPanels";
import type { PluginPanelViewId } from "./types";

type Props = {
  view: PluginPanelViewId;
  /** Escape hatch back to a core view (the file explorer). */
  onShowExplorer: () => void;
};

/**
 * Sidebar panel slot for a registry-contributed view (expansion packs V2).
 *
 * The interesting case is `missing`: sidebar state is restored from
 * localStorage before plugins register, so a persisted plugin view is
 * *normally* unresolved on the first render. This deliberately shows a
 * neutral waiting state instead of redirecting to the explorer — a redirect
 * would silently discard the user's selected view on every launch, and would
 * do it more often on slower machines.
 */
export function PluginPanelSlot({ view, onShowExplorer }: Props) {
  // Both selectors return their store's own reference; deriving happens
  // below, outside the selector (CLAUDE.md pitfall #14).
  const panels = usePluginRegistry((s) => s.panels);
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);

  const state = resolvePluginView(view, panels, enabledPacks);

  if (state.kind === "gated") {
    return (
      <PackGatePlaceholder
        view={view}
        pack={state.pack}
        onShowExplorer={onShowExplorer}
      />
    );
  }

  if (state.kind === "missing") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <HugeiconsIcon
          icon={LayersIcon}
          size={22}
          strokeWidth={1.5}
          className="text-muted-foreground/60"
        />
        <div className="flex flex-col gap-1">
          <p className="text-[12.5px] font-medium text-foreground">
            This panel isn’t available
          </p>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            The plugin that provides it hasn’t loaded, or is no longer
            installed.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowExplorer}
          className="text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Show Files
        </button>
      </div>
    );
  }

  return <>{state.panel.render()}</>;
}
