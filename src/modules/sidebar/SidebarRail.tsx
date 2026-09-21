// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The sidebar's rail: the contextual views, and nothing else.
 *
 * It used to be a pinned strip over 34 views with an overflow menu, pin
 * toggles and one-time promotions — three ways to reach a panel, all there to
 * manage a list that did not fit. The list was the problem: most of it was
 * not sidebar material at all. `viewCatalog.ts` says what each view is; the
 * rail shows the `contextual` ones in a fixed order and the palette reaches
 * the rest.
 *
 * A view opened from the palette that is not on the rail still renders in the
 * sidebar, so it appears here too — after a divider, for as long as it is the
 * active view. Otherwise the rail would show nothing selected while a panel
 * sat open above it, and there would be no mark for where you are.
 */

import { Icon, type IconName } from "@/components/icon";
import { useGlidingRail } from "@/components/ui/use-gliding-rail";
import { motion } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { viewEnabled } from "@/lib/packs";
import { usePluginRegistry } from "@/lib/plugins/registry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { findPluginPanel, visiblePluginPanels } from "./pluginPanels";
import { isSidebarViewId, pluginPanelViewId, type SidebarView } from "./types";
import { RAIL_VIEWS, VIEW_CATALOG } from "./viewCatalog";

export const SIDEBAR_RAIL_HEIGHT = 40;

/** Storage left behind by the pin model. Cleared once, on first render. */
const RETIRED_STORAGE_KEYS = ["nexis:pinned-rail-items", "nexis:rail-promoted:ml"];

type RailItemDef = {
  id: SidebarView;
  label: string;
  icon: IconName;
  badge?: number;
};

type Props = {
  activeView: SidebarView;
  onSelectView: (view: SidebarView) => void;
  changedCount: number;
  onOpenHistory?: () => void;
};

export function SidebarRail({
  activeView,
  onSelectView,
  changedCount,
  onOpenHistory,
}: Props) {
  // Selectors return the stores' own arrays — filtering happens locally
  // (CLAUDE.md pitfall #14).
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const registryPanels = usePluginRegistry((s) => s.panels);

  useEffect(() => {
    try {
      for (const key of RETIRED_STORAGE_KEYS) localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing to clean.
    }
  }, []);

  const railItems: RailItemDef[] = [
    ...RAIL_VIEWS.filter((id) => viewEnabled(id, enabledPacks)).map((id) => ({
      id,
      label: VIEW_CATALOG[id].label,
      icon: VIEW_CATALOG[id].icon,
      badge: id === "source-control" ? changedCount : undefined,
    })),
    // A contributed panel joins the rail only by declaring itself contextual
    // with `showInRail: true`; everything else is reached from the palette.
    ...visiblePluginPanels(registryPanels, enabledPacks)
      .filter((p) => p.showInRail === true && !p.legacyView)
      .map((p) => ({
        id: pluginPanelViewId(p.id),
        label: p.title,
        icon: p.icon ?? "layers",
      })),
  ];

  const transient = railItems.some((i) => i.id === activeView)
    ? null
    : describeView(activeView, registryPanels);

  const {
    containerRef: stripRef,
    registerItem,
    activeRect,
    hoverRect,
    hoverId,
    setHoverId,
    transition: railSpring,
  } = useGlidingRail<SidebarView>(
    activeView,
    "horizontal",
    railItems.length + (transient ? 1 : 0),
  );

  return (
    <div
      style={{ height: SIDEBAR_RAIL_HEIGHT }}
      className="flex shrink-0 items-center border-t border-border/50 bg-card px-1.5"
    >
      {/* One accent rail for the whole strip, animated between items, rather
        * than each button drawing its own indicator. `hoverRect` draws a
        * dimmer second rail under whatever the pointer or keyboard is on, so
        * the strip previews where the accent is about to go. */}
      <div
        ref={stripRef}
        className="relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onPointerLeave={() => setHoverId(null)}
      >
        {hoverRect && hoverId !== activeView && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-primary/30"
            initial={false}
            animate={{ x: hoverRect.offset, width: hoverRect.extent }}
            transition={railSpring}
          />
        )}
        {activeRect && (
          <motion.span
            aria-hidden
            // Solid: at 2px tall a dashed rail reads as a rendering artefact;
            // opacity already tells it apart from the hover rail.
            className="pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-primary"
            initial={false}
            animate={{ x: activeRect.offset, width: activeRect.extent }}
            transition={railSpring}
          />
        )}
        {railItems.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            isActive={item.id === activeView}
            onClick={() => onSelectView(item.id)}
            onHover={() => setHoverId(item.id)}
            registerRef={registerItem}
          />
        ))}
        {transient && (
          <>
            <div className="mx-1 h-4 w-px shrink-0 bg-border/40" aria-hidden />
            <RailButton
              item={transient}
              isActive
              onClick={() => onSelectView(transient.id)}
              onHover={() => setHoverId(transient.id)}
              registerRef={registerItem}
            />
          </>
        )}
      </div>

      {onOpenHistory ? (
        <>
          <div className="mx-0.5 h-4 w-px shrink-0 bg-border/40" aria-hidden />
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Open commit history"
                onClick={onOpenHistory}
                className={cn(
                  "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md",
                  "text-muted-foreground outline-none transition-colors duration-150",
                  "hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]",
                  "focus-visible:ring-2 focus-visible:ring-primary/40",
                )}
              >
                <Icon name="clock" size="md" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Commit history</TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
}

/** Label and icon for any view — built-in from the catalogue, contributed
 *  from its registration. Null for a plugin view not registered yet. */
function describeView(
  view: SidebarView,
  panels: Parameters<typeof findPluginPanel>[1],
): RailItemDef | null {
  if (isSidebarViewId(view)) {
    const entry = VIEW_CATALOG[view];
    return { id: view, label: entry.label, icon: entry.icon };
  }
  const panel = findPluginPanel(view, panels);
  return panel ? { id: view, label: panel.title, icon: panel.icon ?? "layers" } : null;
}

// ── Rail icon button ──────────────────────────────────────────────────────────

function RailButton({
  item,
  isActive,
  onClick,
  onHover,
  registerRef,
}: {
  item: RailItemDef;
  isActive: boolean;
  onClick: () => void;
  onHover: () => void;
  registerRef: (id: SidebarView, el: HTMLElement | null) => void;
}) {
  const badge = item.badge && item.badge > 0 ? item.badge : null;
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={item.label}
          aria-pressed={isActive}
          // Anchors the onboarding tour's coach-mark (src/lib/onboarding.ts).
          data-tour={`sidebar-${item.id}`}
          ref={(el) => registerRef(item.id, el)}
          onClick={onClick}
          onPointerEnter={onHover}
          onFocus={onHover}
          className={cn(
            "relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-all duration-150",
            "focus-visible:ring-2 focus-visible:ring-primary/40",
            isActive
              ? "bg-primary/[0.07] text-foreground dark:bg-primary/[0.1]"
              : "text-muted-foreground hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]",
          )}
        >
          <Icon
            name={item.icon}
            size="md"
            className={cn("shrink-0 transition-[stroke-width,color] duration-150", isActive && "text-primary")}
          />
          {badge ? (
            <span className={cn(
              "absolute -right-0.5 -top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full px-0.5",
              "text-[8px] font-bold leading-none tabular-nums",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted-foreground/70 text-background",
            )}>
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{item.label}</TooltipContent>
    </Tooltip>
  );
}
