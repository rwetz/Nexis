// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Host for the `svg-playground` tab — the playground detached from the rail,
 * where there is room to put the preview beside the code rather than under it.
 *
 * The tab carries no document of its own: the source lives in the playground's
 * storage, so this and the sidebar panel are two views of one thing. Closing
 * the tab is therefore losing nothing, which is why collapsing is just a
 * close.
 */

import { Icon } from "@/components/icon";
import type { Tab } from "@/modules/tabs/lib/tabTypes";
import { SvgPlayground } from "./SvgPlayground";

export function SvgPlaygroundStack({
  tabs,
  activeId,
  onCollapse,
}: {
  tabs: Tab[];
  activeId: number | null;
  /** Close this tab — the playground stays in the sidebar. */
  onCollapse?: (tabId: number) => void;
}) {
  const tab = tabs.find(
    (t): t is Extract<Tab, { kind: "svg-playground" }> =>
      t.kind === "svg-playground" && t.id === activeId,
  );
  if (!tab) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="brush" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          SVG Playground
        </span>
        {onCollapse && (
          <button
            type="button"
            onClick={() => onCollapse(tab.id)}
            title="Back to the sidebar panel"
            aria-label="Collapse the SVG playground back into the sidebar"
            className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Icon name="collapse" size="sm" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <SvgPlayground layout="row" />
      </div>
    </div>
  );
}
