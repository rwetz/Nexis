// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Fragment } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SearchAddon } from "@xterm/addon-search";
import { TerminalPane, type TerminalPaneHandle } from "./TerminalPane";
import type { TerminalPaneNode } from "./lib/panes";

type LeafBundle = {
  setRef: (h: TerminalPaneHandle | null) => void;
  onSearch: (addon: SearchAddon) => void;
  onCwd: (cwd: string) => void;
  onExit: (code: number) => void;
  onTitle: (title: string) => void;
  onClose: () => void;
};

type Props = {
  node: TerminalPaneNode;
  tabVisible: boolean;
  activeLeafId: number;
  onFocusLeaf: (leafId: number) => void;
  getBundle: (leafId: number) => LeafBundle;
  /** True once we're inside a split — gates the focus glow so a lone pane
   *  (the common case) never lights up. Set by the recursive descent. */
  split?: boolean;
};

export function PaneTreeView({
  node,
  tabVisible,
  activeLeafId,
  onFocusLeaf,
  getBundle,
  split = false,
}: Props) {
  if (node.kind === "leaf") {
    const focused = node.id === activeLeafId;
    const b = getBundle(node.id);
    return (
      <div
        onMouseDownCapture={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        // Catches focus from Tab, programmatic focus, or any path that
        // skips mousedown — keeps activeLeafId in sync with DOM focus.
        onFocus={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        data-pane-leaf={node.id}
        className="group/pane relative h-full w-full"
      >
        <TerminalPane
          leafId={node.id}
          visible={tabVisible}
          focused={focused}
          initialCwd={node.cwd}
          ref={b.setRef}
          onSearchReady={(_id, addon) => b.onSearch(addon)}
          onCwd={(_id, cwd) => b.onCwd(cwd)}
          onExit={(_id, code) => b.onExit(code)}
          onTitle={(_id, title) => b.onTitle(title)}
        />
        {/* Per-pane close — only inside a split (a lone pane closes via the
         *  tab). Offset left of the record toggle (right-2) so they don't
         *  overlap. Revealed on pane hover. */}
        {split && (
          <button
            type="button"
            aria-label="Close pane"
            title="Close pane"
            onClick={(e) => {
              e.stopPropagation();
              b.onClose();
            }}
            className="absolute right-9 top-2 z-40 flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground opacity-0 shadow-sm transition-opacity duration-150 hover:border-red-400/60 hover:bg-muted hover:text-red-400 group-hover/pane:opacity-100"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
          </button>
        )}
        {/* Focus ring — overlay drawn ON TOP of the terminal so it shows on
         *  all four sides (see .pane-focus-ring in globals.css). */}
        {focused && split && (
          <div className="pane-focus-ring pointer-events-none absolute inset-0 z-30 rounded-[inherit]" />
        )}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation={node.dir === "row" ? "horizontal" : "vertical"}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <ResizableHandle />}
          <ResizablePanel id={`pane-${child.id}`} minSize="10%">
            <PaneTreeView
              node={child}
              tabVisible={tabVisible}
              activeLeafId={activeLeafId}
              onFocusLeaf={onFocusLeaf}
              getBundle={getBundle}
              split
            />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}
