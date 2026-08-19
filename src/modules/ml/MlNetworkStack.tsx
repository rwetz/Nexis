// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Host for `ml-network` tabs — the ML Lab's network diagram detached from the
 * sidebar rail, where it finally has room for a model with more than a
 * handful of inputs.
 *
 * Mirrors GitHistoryStack: App keeps every tab mounted behind a visibility
 * class, so this renders only the active one and nothing at all when the
 * active tab is a different kind.
 */
import type { Tab } from "@/modules/tabs/lib/tabTypes";
import { NetworkGraph } from "./NetworkGraph";

export function MlNetworkStack({
  tabs,
  activeId,
  onCollapse,
}: {
  tabs: Tab[];
  activeId: number | null;
  /** Close this tab — the diagram stays in the ML Lab panel, so collapsing
   *  is just closing the detached copy. */
  onCollapse?: (tabId: number) => void;
}) {
  const tab = tabs.find(
    (t): t is Extract<Tab, { kind: "ml-network" }> =>
      t.kind === "ml-network" && t.id === activeId,
  );
  if (!tab) return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* `key` on the project dir: the graph loads train.toml and the data
          CSV in effects keyed to it, and remounting is the cheapest way to
          guarantee no stale architecture survives a project switch. */}
      <NetworkGraph
        key={tab.projectDir}
        projectDir={tab.projectDir}
        variant="tab"
        onCollapse={onCollapse ? () => onCollapse(tab.id) : undefined}
      />
    </div>
  );
}
