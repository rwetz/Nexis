// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Reorder, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { CAPABILITY_TOOL_WINDOWS } from "@/capabilities";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTitlebarToolOrder } from "@/modules/settings/store";
import { mergeToolOrder, orderTools, visibleTools } from "./permanentTools";

/**
 * Every tool-window launcher in one row: the workbenches (SVG Studio, ML Lab,
 * Web, Documents) and the companion apps (Atlas, Benchmark). They used to be
 * two rows side by side, each with its own leading padding, which is why the
 * gap before Atlas was wider than the rest.
 *
 * Drag a launcher to reorder. It is motion's pointer-driven `Reorder`, not
 * HTML drag and drop, which the webview's own file-drop handling intercepts
 * on Windows. A drag that moved does not also open the tool.
 */
export function TitlebarTools({
  compact,
  onOpenTool,
}: {
  compact: boolean;
  onOpenTool: (id: string) => void;
}) {
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const savedOrder = usePreferencesStore((s) => s.titlebarToolOrder);
  const reduceMotion = useReducedMotion();

  const tools = useMemo(
    () => orderTools(visibleTools(CAPABILITY_TOOL_WINDOWS, enabledPacks), savedOrder),
    [enabledPacks, savedOrder],
  );
  const byId = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools]);

  // The live order while a drag is in flight, so the row slides under the
  // pointer before anything is saved. Ignored if a pack was toggled mid-drag
  // and the set of launchers no longer matches it.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const order =
    dragOrder && dragOrder.length === tools.length && dragOrder.every((id) => byId.has(id))
      ? dragOrder
      : tools.map((tool) => tool.id);
  const dragged = useRef(false);

  if (tools.length === 0) return null;

  const commit = () => {
    if (dragOrder) void setTitlebarToolOrder(mergeToolOrder(savedOrder, order));
    setDragOrder(null);
    // The click that ends a drag lands before this runs; one that never
    // comes (released off the button) must not swallow the next real click.
    setTimeout(() => {
      dragged.current = false;
    }, 0);
  };

  return (
    <Reorder.Group
      as="div"
      axis="x"
      values={order}
      onReorder={setDragOrder}
      role="toolbar"
      aria-label="Tools"
      className="flex shrink-0 items-center gap-0.5 pl-1"
    >
      {order.map((id) => {
        const tool = byId.get(id);
        if (!tool) return null;
        return (
          <Reorder.Item
            key={id}
            value={id}
            as="div"
            layout={reduceMotion ? undefined : "position"}
            onDragStart={() => {
              dragged.current = true;
            }}
            onDragEnd={commit}
            // Keep the press from reaching the titlebar's window-drag region.
            onPointerDown={(e) => e.stopPropagation()}
            whileDrag={{ scale: 1.06, zIndex: 1 }}
            className="relative"
          >
            <button
              type="button"
              title={`Open ${tool.label} — drag to reorder`}
              aria-label={`Open ${tool.label}`}
              onClick={() => {
                // The click that ends a drag is not a request to open.
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                onOpenTool(tool.id);
              }}
              className={cn(
                "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 active:scale-95",
                "hover:bg-primary/[0.07] hover:text-primary dark:hover:bg-primary/[0.1]",
                "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                compact ? "size-7" : "h-7 px-2",
              )}
            >
              <Icon name={tool.icon} size="sm" />
              {!compact && <span>{tool.label}</span>}
            </button>
          </Reorder.Item>
        );
      })}
    </Reorder.Group>
  );
}
