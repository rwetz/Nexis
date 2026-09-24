// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * One accent rail that travels between the items of a nav, instead of each
 * item painting its own indicator.
 *
 * Used by both navs in the app — the horizontal sidebar rail and the vertical
 * Settings nav — because they are the same idea at ninety degrees, and two
 * copies of a measuring hook is how the two stop agreeing about how fast the
 * rail moves.
 *
 * Measurement uses `offsetLeft`/`offsetTop` rather than
 * `getBoundingClientRect`. Those are already expressed relative to the
 * container (its nearest positioned ancestor), which is exactly the
 * coordinate space an absolutely-positioned rail draws in. Client rects would
 * additionally carry the app's ancestor CSS `zoom` and any scroll offset,
 * both of which would then have to be divided back out — the same class of
 * mistake as AGENTS.md pitfall #15.
 */

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Offset and extent along the rail's axis, in container-relative pixels. */
export type RailRect = { offset: number; extent: number };

export type GlidingRail<Id> = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  registerItem: (id: Id, el: HTMLElement | null) => void;
  activeRect: RailRect | null;
  hoverRect: RailRect | null;
  /** Length the indicator spans along the axis (items' far edge, at least the
   *  visible box). `RailIndicator` clips it down to the selected item. */
  containerExtent: number;
  axis: "horizontal" | "vertical";
  hoverId: Id | null;
  setHoverId: (id: Id | null) => void;
  /** Spring for the travel; collapses to an instant move under reduced motion. */
  transition: { duration: number } | { type: "spring"; stiffness: number; damping: number };
};

/**
 * @param activeId  The item the rail should rest on.
 * @param axis      Which way the nav runs.
 * @param revision  Bump to force a re-measure when the item set changes
 *                  (item count is the usual value).
 */
export function useGlidingRail<Id>(
  activeId: Id,
  axis: "horizontal" | "vertical",
  revision: number,
): GlidingRail<Id> {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<Id, HTMLElement>());
  const [activeRect, setActiveRect] = useState<RailRect | null>(null);
  const [hoverId, setHoverId] = useState<Id | null>(null);
  const [hoverRect, setHoverRect] = useState<RailRect | null>(null);
  const [containerExtent, setContainerExtent] = useState(0);
  const reduceMotion = useReducedMotion();

  const registerItem = useCallback((id: Id, el: HTMLElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, []);

  const measure = useCallback(
    (id: Id | null): RailRect | null => {
      if (id === null || id === undefined) return null;
      const el = itemRefs.current.get(id);
      if (!el) return null;
      return axis === "horizontal"
        ? { offset: el.offsetLeft, extent: el.offsetWidth }
        : { offset: el.offsetTop, extent: el.offsetHeight };
    },
    [axis],
  );

  // Layout effects, so the rail never paints a frame at a stale position
  // after the item set or the selection changes.
  const measureContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // The far edge of the last item, or the visible box if that is larger.
    // Not `scrollWidth`: the indicator is itself an absolutely positioned
    // child sized to this value, and abs-pos children count toward scroll
    // overflow, so a strip would stay as wide as it ever was after shrinking.
    let end = axis === "horizontal" ? el.clientWidth : el.clientHeight;
    for (const item of itemRefs.current.values()) {
      end = Math.max(
        end,
        axis === "horizontal"
          ? item.offsetLeft + item.offsetWidth
          : item.offsetTop + item.offsetHeight,
      );
    }
    setContainerExtent(end);
  }, [axis]);

  useLayoutEffect(() => {
    setActiveRect(measure(activeId));
    measureContainer();
  }, [activeId, revision, measure, measureContainer]);

  useLayoutEffect(() => {
    setHoverRect(measure(hoverId));
  }, [hoverId, revision, measure]);

  // The container is flexible in both navs, so its items move when the
  // window does even though nothing about the selection changed.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setActiveRect(measure(activeId));
      measureContainer();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeId, measure, measureContainer]);

  return {
    containerRef,
    registerItem,
    activeRect,
    hoverRect,
    containerExtent,
    axis,
    hoverId,
    setHoverId,
    transition: reduceMotion
      ? { duration: 0 }
      : { type: "spring", stiffness: 520, damping: 40 },
  };
}
