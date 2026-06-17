// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  /** Fade depth in px. */
  size?: number;
};

/**
 * Scroll container that fades its content at whichever edge has more to
 * reveal — a soft depth cue that also signals "there's more here". Only the
 * overflowing edge fades (never the resting top), so the first row is never
 * clipped. Drop-in replacement for an `overflow-y-auto` wrapper.
 */
export function ScrollFade({ children, className, size = 24 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setEdges({
        top: scrollTop > 2,
        bottom: scrollTop + clientHeight < scrollHeight - 2,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const top = `${size}px`;
  const bottom = `calc(100% - ${size}px)`;
  const mask =
    edges.top && edges.bottom
      ? `linear-gradient(to bottom, transparent, #000 ${top}, #000 ${bottom}, transparent)`
      : edges.top
        ? `linear-gradient(to bottom, transparent, #000 ${top})`
        : edges.bottom
          ? `linear-gradient(to bottom, #000 ${bottom}, transparent)`
          : undefined;

  return (
    <div
      ref={ref}
      className={cn("overflow-y-auto", className)}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      {children}
    </div>
  );
}
