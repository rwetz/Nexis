// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Resolution logic for registry-contributed sidebar panels (expansion packs
 * V2).
 *
 * Kept pure and separate from the rail so the awkward cases — a view whose
 * plugin has not registered yet, a panel whose pack is disabled, a persisted
 * view for a plugin that no longer exists — are unit-testable without a DOM.
 * Those cases are the whole difficulty: unlike built-in views, a plugin panel
 * can legitimately be *absent* at the moment the view is restored.
 */

import { packEnabled, type PackId } from "@/lib/packs";
import type { PanelContribution } from "@/lib/plugins/types";
import { panelIdFromView, type SidebarView } from "./types";

/** Only sidebar-located contributions are rail candidates. */
export function sidebarPanels(
  panels: readonly PanelContribution[],
): PanelContribution[] {
  return panels.filter((p) => p.location === "sidebar");
}

/** The contribution backing a view, or null for built-ins and unknown ids. */
export function findPluginPanel(
  view: SidebarView,
  panels: readonly PanelContribution[],
): PanelContribution | null {
  const id = panelIdFromView(view);
  if (id == null) return null;
  return panels.find((p) => p.id === id && p.location === "sidebar") ?? null;
}

/**
 * What the panel slot should show for a plugin view.
 *
 * - `missing` — no contribution with that id. Either the plugin hasn't
 *   registered yet (state restores before plugins load) or it's gone for
 *   good. The caller shows a neutral placeholder; it must NOT reset the view,
 *   or a slow-registering plugin would lose the user's selection on
 *   every launch.
 * - `gated` — registered, but its expansion pack is off.
 * - `ready` — render it.
 */
export type PluginViewState =
  | { kind: "missing" }
  | { kind: "gated"; pack: PackId; panel: PanelContribution }
  | { kind: "ready"; panel: PanelContribution };

export function resolvePluginView(
  view: SidebarView,
  panels: readonly PanelContribution[],
  enabledPacks: readonly PackId[],
): PluginViewState {
  const panel = findPluginPanel(view, panels);
  if (!panel) return { kind: "missing" };
  if (!packEnabled(panel.pack, enabledPacks)) {
    // `pack` is non-null here: packEnabled only returns false when it is set.
    return { kind: "gated", pack: panel.pack as PackId, panel };
  }
  return { kind: "ready", panel };
}

/** Rail visibility for a contributed panel. */
export function visiblePluginPanels(
  panels: readonly PanelContribution[],
  enabledPacks: readonly PackId[],
): PanelContribution[] {
  return sidebarPanels(panels)
    .filter((p) => packEnabled(p.pack, enabledPacks))
    .sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
    );
}
