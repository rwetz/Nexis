// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Which tabs the bottom panel has, and which views it owns.
 *
 * Pure so the routing rule — "a session view opens here, never in the
 * sidebar" — is testable without a DOM. The rule is enforced in one place,
 * `persistSidebarView`, by asking `isBottomView`.
 */

import type { IconName } from "@/components/icon";
import { packEnabled, viewEnabled, type PackId } from "@/lib/packs";
import type { PanelContribution } from "@/lib/plugins/types";
import {
  isSidebarViewId,
  pluginPanelViewId,
  SIDEBAR_VIEW_IDS,
  type SidebarView,
  type SidebarViewId,
} from "@/modules/sidebar/types";
import { VIEW_CATALOG } from "@/modules/sidebar/viewCatalog";
import { PROBLEMS_TAB, type BottomTab } from "./store";

export type BottomTabDef = { id: BottomTab; label: string; icon: IconName };

/** Built-in session views, in catalogue order. */
export const SESSION_VIEWS: readonly SidebarViewId[] = SIDEBAR_VIEW_IDS.filter(
  (id) => VIEW_CATALOG[id].kind === "session",
).sort(
  (a, b) =>
    Object.keys(VIEW_CATALOG).indexOf(a) - Object.keys(VIEW_CATALOG).indexOf(b),
);

/** Contributed panels that live in the bottom panel. */
export function bottomContributions(
  panels: readonly PanelContribution[],
): PanelContribution[] {
  return panels.filter((p) => p.location === "bottom");
}

/** The contribution rendering a bottom tab, whether addressed by its legacy
 *  view id (first-party migrations) or its `plugin:` view. */
export function findBottomContribution(
  tab: BottomTab,
  panels: readonly PanelContribution[],
): PanelContribution | null {
  return (
    bottomContributions(panels).find(
      (p) => p.legacyView === tab || pluginPanelViewId(p.id) === tab,
    ) ?? null
  );
}

/** Whether a view belongs to the bottom panel rather than the sidebar. */
export function isBottomView(
  view: SidebarView,
  panels: readonly PanelContribution[],
): boolean {
  if (isSidebarViewId(view)) return VIEW_CATALOG[view].kind === "session";
  return findBottomContribution(view, panels) !== null;
}

/** The strip, in order: Problems, the built-in sessions, then contributed
 *  bottom panels. Pack-gated like everything else. */
export function bottomTabs(
  enabledPacks: readonly PackId[],
  panels: readonly PanelContribution[],
): BottomTabDef[] {
  return [
    { id: PROBLEMS_TAB, label: "Problems", icon: "alert" },
    ...SESSION_VIEWS.filter((id) => viewEnabled(id, enabledPacks)).map((id) => ({
      id,
      label: VIEW_CATALOG[id].label,
      icon: VIEW_CATALOG[id].icon,
    })),
    ...bottomContributions(panels)
      .filter((p) => !p.legacyView && packEnabled(p.pack, enabledPacks))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title))
      .map((p) => ({
        id: pluginPanelViewId(p.id),
        label: p.title,
        icon: p.icon ?? "layers",
      })),
  ];
}
