// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The bottom panel's body: a tab strip over the sessions.
 *
 * A tab mounts the first time it is shown and then **stays mounted**, hidden,
 * for as long as it exists. That is the point of giving sessions their own
 * surface: a build keeps its output and a REPL keeps its history while you
 * look at Tests. (In the sidebar they unmounted on every view switch, so
 * glancing at Files threw a running build's log away.) First mount is still
 * lazy, so a tab you never open costs nothing.
 *
 * Hidden tabs are `invisible` and `inert` in an absolute stack rather than
 * `display: none`: several of these measure themselves (xterm in the REPL,
 * the system monitor's charts), and a box with no layout answers with zeros.
 *
 * Built-in bodies come from `renderBuiltin` — App owns their props. Tabs
 * backed by a contributed panel (`location: "bottom"`) render the
 * contribution directly.
 */

import { Icon } from "@/components/icon";
import { useGlidingRail } from "@/components/ui/use-gliding-rail";
import { packEnabled } from "@/lib/packs";
import { usePluginRegistry } from "@/lib/plugins/registry";
import { cn } from "@/lib/utils";
import { useDiagnosticsStore } from "@/modules/problems/diagnosticsStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { PackGatePlaceholder } from "@/modules/sidebar/PackGatePlaceholder";
import { pluginPanelViewId } from "@/modules/sidebar/types";
import { motion } from "motion/react";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { PROBLEMS_TAB, useBottomPanelStore, type BottomTab } from "./store";
import { bottomTabs, findBottomContribution } from "./tabs";

type Props = {
  /** Body for Problems and the built-in (non-contributed) sessions. */
  renderBuiltin: (tab: BottomTab) => ReactNode;
};

export function BottomPanel({ renderBuiltin }: Props) {
  const tab = useBottomPanelStore((s) => s.tab);
  const setTab = useBottomPanelStore((s) => s.setTab);
  const close = useBottomPanelStore((s) => s.close);
  const maximized = useBottomPanelStore((s) => s.maximized);
  const toggleMaximized = useBottomPanelStore((s) => s.toggleMaximized);
  const status = useBottomPanelStore((s) => s.status);
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const panels = usePluginRegistry((s) => s.panels);
  const errorCount = useDiagnosticsStore((s) => s.errorCount);
  const warningCount = useDiagnosticsStore((s) => s.warningCount);

  const tabs = bottomTabs(enabledPacks, panels);
  // A tab whose pack was switched off, or a stale persisted id, falls back to
  // Problems rather than rendering an empty body under no selected tab.
  const active = tabs.some((t) => t.id === tab) ? tab : PROBLEMS_TAB;

  const [visited, setVisited] = useState<ReadonlySet<BottomTab>>(() => new Set([active]));
  const tabKey = tabs.map((t) => t.id).join("|");
  useEffect(() => {
    const live = new Set(tabKey.split("|"));
    setVisited((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      next.add(active);
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
    });
  }, [active, tabKey]);

  const rail = useGlidingRail<BottomTab>(active, "horizontal", tabs.length);
  const problemCount = errorCount + warningCount;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-bottom-panel>
      <div className="flex h-8 shrink-0 items-center border-b border-border/50 pl-1.5 pr-1">
        <div
          ref={rail.containerRef}
          role="tablist"
          aria-label="Bottom panel"
          className="relative flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerLeave={() => rail.setHoverId(null)}
        >
          {rail.hoverRect && rail.hoverId !== active && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-primary/30"
              initial={false}
              animate={{ x: rail.hoverRect.offset, width: rail.hoverRect.extent }}
              transition={rail.transition}
            />
          )}
          {rail.activeRect && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-primary"
              initial={false}
              animate={{ x: rail.activeRect.offset, width: rail.activeRect.extent }}
              transition={rail.transition}
            />
          )}
          {tabs.map((t) => {
            const isActive = t.id === active;
            const state = status[t.id] ?? "idle";
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                ref={(el) => rail.registerItem(t.id, el)}
                onClick={() => setTab(t.id)}
                onPointerEnter={() => rail.setHoverId(t.id)}
                onFocus={() => rail.setHoverId(t.id)}
                className={cn(
                  "relative z-10 flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {state !== "idle" && (
                  <span
                    aria-label={state === "running" ? "running" : "finished with failures"}
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      state === "running" ? "nexis-blink bg-primary" : "bg-destructive",
                    )}
                  />
                )}
                {t.label}
                {t.id === PROBLEMS_TAB && problemCount > 0 && (
                  <span
                    className={cn(
                      "tabular-nums",
                      errorCount > 0 ? "text-destructive" : "text-amber-500",
                    )}
                  >
                    {problemCount > 99 ? "99+" : problemCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={toggleMaximized}
          title={maximized ? "Restore panel" : "Maximize panel"}
          aria-label={maximized ? "Restore panel" : "Maximize panel"}
          aria-pressed={maximized}
          className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Icon name={maximized ? "collapse" : "expand"} size="sm" />
        </button>
        <button
          type="button"
          onClick={close}
          title="Close panel"
          aria-label="Close panel"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Icon name="close" size="sm" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs
          .filter((t) => visited.has(t.id) || t.id === active)
          .map((t) => {
            const isActive = t.id === active;
            return (
              <div
                key={t.id}
                role="tabpanel"
                aria-label={t.label}
                inert={!isActive}
                aria-hidden={!isActive}
                data-panel-id={findBottomContribution(t.id, panels)?.id}
                className={cn(
                  "absolute inset-0 min-h-0",
                  !isActive && "invisible pointer-events-none",
                )}
              >
                <TabBody tab={t.id} renderBuiltin={renderBuiltin} />
              </div>
            );
          })}
      </div>
    </div>
  );
}

function TabBody({
  tab,
  renderBuiltin,
}: {
  tab: BottomTab;
  renderBuiltin: (tab: BottomTab) => ReactNode;
}) {
  const panels = usePluginRegistry((s) => s.panels);
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const close = useBottomPanelStore((s) => s.close);
  const contribution = findBottomContribution(tab, panels);
  if (!contribution) return <>{renderBuiltin(tab)}</>;
  if (!packEnabled(contribution.pack, enabledPacks) && contribution.pack) {
    return (
      <PackGatePlaceholder
        view={contribution.legacyView ?? pluginPanelViewId(contribution.id)}
        pack={contribution.pack}
        onShowExplorer={close}
      />
    );
  }
  return (
    <Suspense fallback={null}>
      <div className="h-full min-h-0">{contribution.render()}</div>
    </Suspense>
  );
}
