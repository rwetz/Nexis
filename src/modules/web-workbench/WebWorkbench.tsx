// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Host for the `web` tab: Ports, HTTP Client and Web Tools behind one strip.
 *
 * The three bodies are the existing capability contributions, rendered by
 * their legacy view id. They carry their own wiring (workspace key, preview
 * opener) through the integration host, so this owns none of it. Each is
 * pack-gated on its own: Ports belongs to Dev Tools, the other two to Web
 * Dev, and a tool whose pack is off is simply absent from the strip.
 *
 * Tools mount on first view and then stay mounted, hidden, like the bottom
 * panel's sessions: an HTTP response or a half-edited request survives a look
 * at Ports.
 */

import { RailIndicator } from "@/components/ui/rail-indicator";
import { Icon } from "@/components/icon";
import { useGlidingRail } from "@/components/ui/use-gliding-rail";
import { packEnabled } from "@/lib/packs";
import { usePluginRegistry } from "@/lib/plugins/registry";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Tab } from "@/modules/tabs/lib/tabTypes";
import { Suspense, useEffect, useState } from "react";
import { useWebWorkbenchStore, WEB_TOOLS, type WebTool } from "./store";

export function WebWorkbench({
  tabs,
  activeId,
  onClose,
}: {
  tabs: Tab[];
  activeId: number | null;
  onClose?: (tabId: number) => void;
}) {
  const tool = useWebWorkbenchStore((s) => s.tool);
  const setTool = useWebWorkbenchStore((s) => s.setTool);
  const panels = usePluginRegistry((s) => s.panels);
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);

  const available = WEB_TOOLS.flatMap((t) => {
    const contribution = panels.find((p) => p.legacyView === t.id);
    return contribution && packEnabled(contribution.pack, enabledPacks)
      ? [{ ...t, contribution }]
      : [];
  });
  const active: WebTool | undefined = available.some((t) => t.id === tool)
    ? tool
    : available[0]?.id;

  const [visited, setVisited] = useState<ReadonlySet<WebTool>>(() => new Set());
  useEffect(() => {
    if (!active) return;
    setVisited((prev) => (prev.has(active) ? prev : new Set([...prev, active])));
  }, [active]);

  const rail = useGlidingRail<WebTool | "">(active ?? "", "horizontal", available.length);
  const tab = tabs.find((t) => t.kind === "web" && t.id === activeId);
  if (!tab) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-3 py-1.5">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon name="globe" className="text-muted-foreground" />
          Web
        </span>
        <div
          ref={rail.containerRef}
          role="tablist"
          aria-label="Web tools"
          className="relative flex min-w-0 items-center gap-1"
          onPointerLeave={() => rail.setHoverId(null)}
        >
          <RailIndicator
            rail={rail}
            rect={rail.activeRect}
            radius={8}
            className="inset-y-0 bg-primary/15"
          />
          {available.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              ref={(el) => rail.registerItem(t.id, el)}
              onClick={() => setTool(t.id)}
              onPointerEnter={() => rail.setHoverId(t.id)}
              className={cn(
                "relative z-10 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active === t.id ? "text-primary" : "text-muted-foreground/80 hover:text-foreground",
              )}
            >
              <Icon name={t.icon} size="xs" active={active === t.id} />
              {t.label}
            </button>
          ))}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={() => onClose(tab.id)}
            title="Close Web"
            aria-label="Close Web"
            className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Icon name="collapse" size="sm" />
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {available
          .filter((t) => t.id === active || visited.has(t.id))
          .map((t) => (
            <div
              key={t.id}
              role="tabpanel"
              aria-label={t.label}
              data-panel-id={t.contribution.id}
              inert={t.id !== active}
              aria-hidden={t.id !== active}
              className={cn(
                "absolute inset-0 min-h-0",
                t.id !== active && "invisible pointer-events-none",
              )}
            >
              <Suspense fallback={null}>
                <div className="h-full min-h-0">{t.contribution.render()}</div>
              </Suspense>
            </div>
          ))}
        {available.length === 0 && (
          <p className="p-4 text-[12px] text-muted-foreground">
            Turn on the Web Dev or Dev Tools pack in Settings to use the Web workbench.
          </p>
        )}
      </div>
    </div>
  );
}
