// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Host for the `svg-playground` tab — SVG Studio.
 *
 * The Studio is the whole Art pack in one place: the playground ("Draw") plus
 * the five tools that used to be separate sidebar panels. They are one suite —
 * Favicon and Animate read the playground's document, Backdrop reads the
 * Palette's colours — so they belong behind one door rather than scattered
 * across a rail next to Source Control. The sidebar keeps only panels you
 * glance at while working; this is a place you go to and stay.
 *
 * The strip lives in the Studio header, not in the playground's left-pane
 * strip (Source / Canvas / Shapes / Presets), because every tool here carries
 * its own preview and export. Slotted into the left pane they would sit beside
 * the playground's preview column — two previews, two export bars, only one
 * of them about the thing on screen.
 *
 * Draw stays mounted while another tool is in front, so its pane choice and
 * optimize summary survive a detour to the palette. It is hidden with
 * `invisible`, not `display: none`: the canvas measures `getScreenCTM`, and a
 * box with no layout answers with zeros. The other tools mount on demand —
 * Favicon and Animate read the document at mount, so a fresh mount is what
 * picks up the latest drawing.
 *
 * The tab carries no document of its own: the source lives in the
 * playground's storage, so closing the tab loses nothing, which is why
 * collapsing is just a close.
 */

import { Icon } from "@/components/icon";
import { useGlidingRail } from "@/components/ui/use-gliding-rail";
import { cn } from "@/lib/utils";
import type { Tab } from "@/modules/tabs/lib/tabTypes";
import { motion } from "motion/react";
import { AnimatorPanel } from "./AnimatorPanel";
import { BackdropPanel } from "./BackdropPanel";
import { FaviconPanel } from "./FaviconPanel";
import { IconSetPanel } from "./IconSetPanel";
import { PalettePanel } from "./PalettePanel";
import { STUDIO_TOOLS, useSvgStudioStore, type StudioTool } from "./studioStore";
import { SvgPlayground } from "./SvgPlayground";

export function SvgPlaygroundStack({
  tabs,
  activeId,
  onCollapse,
  workspaceRoot,
}: {
  tabs: Tab[];
  activeId: number | null;
  /** Close this tab. The document is in storage, so nothing is lost. */
  onCollapse?: (tabId: number) => void;
  /** Where "Save to workspace" writes. Null disables it. */
  workspaceRoot: string | null;
}) {
  const tool = useSvgStudioStore((s) => s.tool);
  const setTool = useSvgStudioStore((s) => s.setTool);
  const rail = useGlidingRail<StudioTool>(tool, "horizontal", STUDIO_TOOLS.length);

  const tab = tabs.find(
    (t): t is Extract<Tab, { kind: "svg-playground" }> =>
      t.kind === "svg-playground" && t.id === activeId,
  );
  if (!tab) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-3 py-1.5">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon name="brush" className="text-muted-foreground" />
          SVG Studio
        </span>
        <div
          ref={rail.containerRef}
          role="tablist"
          aria-label="SVG Studio tools"
          className="relative flex min-w-0 items-center gap-1 overflow-x-auto"
          onPointerLeave={() => rail.setHoverId(null)}
        >
          {rail.activeRect && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 rounded-md bg-primary/15"
              initial={false}
              animate={{ x: rail.activeRect.offset, width: rail.activeRect.extent }}
              transition={rail.transition}
            />
          )}
          {STUDIO_TOOLS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tool === id}
              ref={(el) => rail.registerItem(id, el)}
              onClick={() => setTool(id)}
              onPointerEnter={() => rail.setHoverId(id)}
              className={cn(
                "relative z-10 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                tool === id
                  ? "text-primary"
                  : "text-muted-foreground/80 hover:text-foreground",
              )}
            >
              <Icon name={icon} size="xs" active={tool === id} />
              {label}
            </button>
          ))}
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={() => onCollapse(tab.id)}
            title="Close SVG Studio"
            aria-label="Close SVG Studio"
            className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Icon name="collapse" size="sm" />
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "absolute inset-0",
            tool !== "draw" && "invisible pointer-events-none",
          )}
          aria-hidden={tool !== "draw"}
        >
          <SvgPlayground layout="row" workspaceRoot={workspaceRoot} />
        </div>
        {tool !== "draw" && (
          <div className="absolute inset-0">
            <StudioToolBody tool={tool} workspaceRoot={workspaceRoot} />
          </div>
        )}
      </div>
    </div>
  );
}

function StudioToolBody({
  tool,
  workspaceRoot,
}: {
  tool: Exclude<StudioTool, "draw">;
  workspaceRoot: string | null;
}) {
  switch (tool) {
    case "palette":
      return <PalettePanel workspaceRoot={workspaceRoot} />;
    case "backdrop":
      return <BackdropPanel workspaceRoot={workspaceRoot} />;
    case "icon-set":
      return <IconSetPanel workspaceRoot={workspaceRoot} />;
    case "favicon":
      return <FaviconPanel workspaceRoot={workspaceRoot} />;
    case "animator":
      return <AnimatorPanel workspaceRoot={workspaceRoot} />;
  }
}
