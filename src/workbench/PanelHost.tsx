import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { usePluginRegistry } from "@/lib/plugins/registry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { packEnabled } from "@/lib/packs";
import { findPluginPanel } from "@/modules/sidebar/pluginPanels";
import { PluginPanelSlot } from "@/modules/sidebar/PluginPanelSlot";
import { isPluginPanelViewId, type SidebarView } from "@/modules/sidebar/types";
import { PackGatePlaceholder } from "@/modules/sidebar/PackGatePlaceholder";
import type { PanelContribution } from "@/lib/plugins/types";

/** One lifetime owner for contributed panels. Retained panels remain inert and
 * hidden between activations; disabling their pack releases them immediately. */
export function PanelHost({ view, fallback, onShowExplorer, pendingViews = [] }: {
  view: SidebarView; fallback: ReactNode; onShowExplorer(): void; pendingViews?: readonly string[];
}) {
  const panels = usePluginRegistry((s) => s.panels);
  const packs = usePreferencesStore((s) => s.enabledPacks);
  const active = findPluginPanel(view, panels);
  const [visited, setVisited] = useState<ReadonlySet<PanelContribution>>(() => new Set());
  const context = { activePanelId: active?.id ?? null, inputFocused: false };
  const admitted = panels.filter((panel) => panel.location === "sidebar" && packEnabled(panel.pack, packs) && (panel.enabled?.(context) ?? true));
  const activeEnabled = active != null && admitted.includes(active);
  const activeElement = useRef<HTMLDivElement>(null);
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current !== view && activeEnabled) {
      activeElement.current?.focus({ preventScroll: true });
    }
    previousView.current = view;
  }, [view, activeEnabled]);
  useEffect(() => {
    setVisited((previous) => {
      const next = new Set([...previous].filter((panel) => panels.includes(panel) && packEnabled(panel.pack, packs)));
      if (active && activeEnabled) next.add(active);
      return next.size === previous.size && [...next].every((panel) => previous.has(panel)) ? previous : next;
    });
  }, [active, activeEnabled, panels, packs]);

  return <>
    {admitted.filter((panel) => panel === active || (panel.lifecycle === "retain" && visited.has(panel))).map((panel) => (
      <div key={panel.id} ref={panel === active ? activeElement : undefined} data-panel-id={panel.id} hidden={panel !== active} inert={panel !== active} className="h-full min-h-0" tabIndex={-1}>
        <Suspense fallback={null}>{panel.render()}</Suspense>
      </div>
    ))}
    {active && !activeEnabled && (active.pack && !packEnabled(active.pack, packs)
      ? <PackGatePlaceholder view={view} pack={active.pack} onShowExplorer={onShowExplorer} />
      : <p className="p-4 text-sm text-muted-foreground">This panel is unavailable in the current workspace.</p>)}
    {!active && (pendingViews.includes(view) ? null : isPluginPanelViewId(view)
      ? <PluginPanelSlot view={view} onShowExplorer={onShowExplorer} />
      : fallback)}
  </>;
}
