// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The workspace with the bottom panel docked under it.
 *
 * **Deliberately not a react-resizable-panels group.** The first version was
 * one, and turning Ctrl+J into a blank window taught why: a group reports
 * sizes through `onResize`, and the panel's open/closed/maximized state had
 * to be read back out of those reports ("zero means the user dragged it
 * shut"). A newly added panel reports transient sizes while the group
 * settles, so the store and the layout chased each other until React gave
 * up and unmounted the root. Here nothing flows from layout back into state:
 * the store says open, closed, maximized and a height in pixels, and this
 * renders exactly that.
 *
 * - **Closed** is height 0, invisible and inert — never unmounted, so every
 *   session keeps its state (a running build keeps its log).
 * - **Maximized** is an overlay over the workspace, not a collapse of it. The
 *   terminal underneath keeps its size, so no PTY is resized at all.
 * - **Dragging** measures in CSS pixels: this sits under `.zoom-content`, so
 *   a pointer delta in client pixels is divided by the rendered-to-layout
 *   ratio (the same zoom trap as AGENTS.md pitfall #15).
 */

import { cn } from "@/lib/utils";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { BottomPanel } from "./BottomPanel";
import { BOTTOM_PANEL_MIN_HEIGHT, useBottomPanelStore, type BottomTab } from "./store";

/** The panel never takes more than this share of the column when docked. */
const MAX_SHARE = 0.7;
const KEY_STEP = 24;

type Props = {
  workspace: ReactNode;
  renderBuiltin: (tab: BottomTab) => ReactNode;
  /** Zen mode: the panel steps aside without being closed. */
  suppressed: boolean;
};

export function PanelDock({ workspace, renderBuiltin, suppressed }: Props) {
  const open = useBottomPanelStore((s) => s.open);
  const everOpened = useBottomPanelStore((s) => s.everOpened);
  const maximized = useBottomPanelStore((s) => s.maximized);
  const height = useBottomPanelStore((s) => s.height);
  const setHeight = useBottomPanelStore((s) => s.setHeight);

  const columnRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startH: number; scale: number } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const shown = open && !suppressed;
  const docked = shown && !maximized;

  const clamp = (h: number) => {
    // Unmeasured (0) means "no ceiling yet", not "a ceiling of zero".
    const column = columnRef.current?.offsetHeight || Infinity;
    return Math.round(Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.min(h, column * MAX_SHARE)));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const column = columnRef.current;
    if (!column || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rendered = column.getBoundingClientRect().height;
    drag.current = {
      startY: e.clientY,
      startH: height,
      scale: column.offsetHeight > 0 ? rendered / column.offsetHeight : 1,
    };
    setDragHeight(height);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setDragHeight(clamp(d.startH + (d.startY - e.clientY) / d.scale));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragHeight != null) setHeight(dragHeight);
    setDragHeight(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    setHeight(clamp(height + (e.key === "ArrowUp" ? KEY_STEP : -KEY_STEP)));
  };

  const effectiveHeight = dragHeight ?? height;

  return (
    <div ref={columnRef} className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">{workspace}</div>
      {everOpened && (
        <div
          inert={!shown}
          aria-hidden={!shown}
          className={cn(
            "flex shrink-0 flex-col overflow-hidden",
            shown ? "border-t border-border/60" : "invisible pointer-events-none",
            shown && maximized && "absolute inset-0 z-30 border-t-0",
          )}
          style={
            !shown
              ? { height: 0 }
              : maximized
                ? undefined
                : { height: effectiveHeight, maxHeight: `${MAX_SHARE * 100}%` }
          }
        >
          {docked && (
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize bottom panel"
              aria-valuenow={effectiveHeight}
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKeyDown}
              className="group relative z-10 -mb-1.5 h-1.5 shrink-0 cursor-row-resize outline-none"
            >
              <span
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 h-px transition-colors",
                  dragHeight != null
                    ? "bg-primary"
                    : "bg-transparent group-hover:bg-primary/50 group-focus-visible:bg-primary",
                )}
              />
            </div>
          )}
          <div className="min-h-0 flex-1">
            <BottomPanel renderBuiltin={renderBuiltin} />
          </div>
        </div>
      )}
    </div>
  );
}
