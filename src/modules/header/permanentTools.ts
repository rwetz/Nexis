// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Titlebar tools: which launchers show, and in what order.
 *
 * Every launcher opens a tool window (capabilities/*: toolWindows). A window
 * that belongs to a pack shows only while that pack is on; one without a pack
 * (Atlas, Benchmark) always shows. The order is the user's, dragged into
 * place and kept as a list of ids; see `orderTools` for how that list
 * survives tools coming and going.
 *
 * Four of the windows replaced sidebar views. Those views stay off the rail
 * while their window is available, so a workbench has one home.
 */
import type { PackId } from "@/lib/packs";
import type { SidebarViewId } from "@/modules/sidebar/types";
import type { ToolWindowContribution } from "@/workbench/capability";

/** The sidebar view each workbench window replaced, keyed by window id. */
const REPLACED_VIEWS: Readonly<Record<string, SidebarViewId>> = {
  "svg-studio": "svg-playground",
  "ml-lab": "ml",
  web: "web-tools",
  documents: "documents",
};

/** The launchers the enabled packs allow, in declaration order. */
export function visibleTools<T extends Pick<ToolWindowContribution, "id" | "pack">>(
  tools: readonly T[],
  enabledPacks: readonly PackId[],
): T[] {
  const enabled = new Set(enabledPacks);
  return tools.filter((tool) => !tool.pack || enabled.has(tool.pack));
}

/**
 * Apply a saved order. Ids that are not showing are skipped rather than
 * dropped from the preference (turning a pack off and on again should put its
 * tool back where it was), and tools the saved order has never seen keep
 * their declared place relative to their neighbours by going to the end.
 */
export function orderTools<T extends { id: string }>(tools: readonly T[], order: readonly string[]): T[] {
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  const placed: T[] = [];
  for (const id of order) {
    const tool = byId.get(id);
    if (tool) {
      placed.push(tool);
      byId.delete(id);
    }
  }
  return [...placed, ...byId.values()];
}

/**
 * Save a new visible order without forgetting hidden tools: each hidden id
 * stays directly after the visible tool it followed before.
 */
export function mergeToolOrder(saved: readonly string[], visibleOrder: readonly string[]): string[] {
  const visible = new Set(visibleOrder);
  // Hidden ids grouped under the visible (or hidden) id they followed; null
  // is the front of the row. A hidden run keeps its own internal order.
  const after = new Map<string | null, string[]>();
  const placed = new Set<string>();
  let anchor: string | null = null;
  for (const id of saved) {
    if (visible.has(id)) {
      anchor = id;
      continue;
    }
    if (placed.has(id)) continue;
    placed.add(id);
    const run = after.get(anchor) ?? [];
    run.push(id);
    after.set(anchor, run);
  }
  return [
    ...(after.get(null) ?? []),
    ...visibleOrder.flatMap((id) => [id, ...(after.get(id) ?? [])]),
  ];
}

/** A replaced view has one home, its window, rather than a duplicate rail row. */
export function isPermanentToolView(
  view: SidebarViewId,
  enabledPacks: readonly PackId[],
  tools: readonly Pick<ToolWindowContribution, "id" | "pack">[],
): boolean {
  return visibleTools(tools, enabledPacks).some((tool) => REPLACED_VIEWS[tool.id] === view);
}
