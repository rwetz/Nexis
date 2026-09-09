// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Workbench tools promoted into the titlebar for the packs that make them
 * part of the primary workflow. This is intentionally derived from enabled
 * packs rather than a saved preset: presets are only starting values, and a
 * user can edit their enabled packs at any time.
 */
import type { IconName } from "@/components/icon";
import type { PackId } from "@/lib/packs";
import type { SidebarViewId } from "@/modules/sidebar/types";

export type PermanentToolId = "svg-playground" | "ml-lab";

export type PermanentTool = {
  id: PermanentToolId;
  label: string;
  title: string;
  icon: IconName;
  pack: PackId;
  /** The former sidebar view this titlebar tool replaces. */
  view: SidebarViewId;
};

export const PERMANENT_TOOLS: readonly PermanentTool[] = [
  {
    id: "svg-playground",
    label: "SVG Studio",
    title: "Open SVG Studio",
    icon: "brush",
    pack: "art",
    view: "svg-playground",
  },
  {
    id: "ml-lab",
    label: "ML Lab",
    title: "Open ML Lab",
    icon: "brain",
    pack: "ml-lab",
    view: "ml",
  },
];

/** Top-margin tools which belong to the active pack configuration. */
export function visiblePermanentTools(
  enabledPacks: readonly PackId[],
): readonly PermanentTool[] {
  return PERMANENT_TOOLS.filter((tool) => enabledPacks.includes(tool.pack));
}

/** A promoted tool has one home in the titlebar, rather than a duplicate rail row. */
export function isPermanentToolView(
  view: SidebarViewId,
  enabledPacks: readonly PackId[],
): boolean {
  return visiblePermanentTools(enabledPacks).some((tool) => tool.view === view);
}
