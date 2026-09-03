// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Sidebar host for the SVG playground.
 *
 * The rail is narrow, so this stacks the preview under the code. The header's
 * expand button detaches the same playground into a tab, where it can lay out
 * side by side — the ML Lab's network diagram established this pattern for the
 * same reason, and the collapse gesture has to be as discoverable as the
 * expand one, which is why the tab carries its own control back.
 */

import { Icon } from "@/components/icon";
import { SvgPlayground } from "./SvgPlayground";

type Props = {
  onExpand: () => void;
};

export function SvgPlaygroundPanel({ onExpand }: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="brush" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          SVG Playground
        </span>
        <button
          type="button"
          onClick={onExpand}
          title="Open in a tab"
          aria-label="Open the SVG playground in a tab"
          className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Icon name="expand" size="sm" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <SvgPlayground layout="col" />
      </div>
    </div>
  );
}
