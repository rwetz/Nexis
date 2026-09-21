// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A soft coloured glow that trails the pointer.
 *
 * Deliberately *scoped*, not global. A full-window aura would sit over the
 * xterm WebGL canvas and the CodeMirror editor — two surfaces that already
 * own their compositing and are the app's frame-budget hot spots — to
 * decorate the one part of the screen the user is reading. So this mounts
 * inside a container and clips to it; `WelcomeScreen` is the intended home.
 *
 * Movement is a per-frame lerp toward the pointer rather than a transition on
 * every `pointermove`, for two reasons: a high-polling-rate mouse fires far
 * more often than the display refreshes, and the lag of chasing rather than
 * tracking is what makes the glow read as a physical thing rather than as a
 * cursor decoration.
 *
 * Fully `aria-hidden` and `pointer-events: none` — it is decoration, and it
 * must never intercept a click meant for the content beneath it.
 */

import { runRafLoopWhileVisible } from "@/components/ui/backgrounds/rafLoop";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

/** Fraction of the remaining distance covered per frame. Lower trails more. */
const FOLLOW = 0.12;
/** Below this, the aura is parked and the transform stops being rewritten. */
const SETTLE_PX = 0.4;

type Props = {
  /** Aura colour. Any CSS colour; the gradient fades it out to transparent. */
  color?: string;
  /** Diameter in CSS pixels. */
  size?: number;
  opacity?: number;
  className?: string;
};

export function CursorAura({
  color = "#5227FF",
  size = 420,
  opacity = 0.5,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const aura = auraRef.current;
    if (!host || !aura) return;

    // Start parked at the centre so the first pointer move eases out from
    // somewhere plausible instead of flying in from the top-left corner.
    let targetX = host.clientWidth / 2;
    let targetY = host.clientHeight / 2;
    let x = targetX;
    let y = targetY;
    let visible = false;

    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      targetX = e.clientX - rect.left;
      targetY = e.clientY - rect.top;
      if (!visible) {
        visible = true;
        aura.style.opacity = String(opacity);
        // Promote only while the aura is actually tracking the pointer, and
        // name the property that moves: it is animated with `translate`,
        // which `will-change: transform` does not cover.
        aura.style.willChange = "translate";
      }
    };

    const onPointerLeave = () => {
      visible = false;
      aura.style.opacity = "0";
      aura.style.willChange = "auto";
    };

    // Listening on the window rather than the host: the host is
    // pointer-events-none territory in places, and an aura that stops
    // updating whenever the pointer crosses a button inside the container
    // reads as broken.
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave);

    const stopLoop = runRafLoopWhileVisible(() => {
      const dx = targetX - x;
      const dy = targetY - y;
      if (Math.abs(dx) < SETTLE_PX && Math.abs(dy) < SETTLE_PX) return;
      x += dx * FOLLOW;
      y += dy * FOLLOW;
      // `translate` rather than `left`/`top`: this runs every frame, and a
      // transform is composited where a position change is a layout.
      aura.style.translate = `${x - size / 2}px ${y - size / 2}px`;
    });

    return () => {
      stopLoop();
      window.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [opacity, size]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <div
        ref={auraRef}
        className="absolute top-0 left-0 rounded-full opacity-0 transition-opacity duration-(--dur-window)"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at center, ${color} 0%, transparent 68%)`,
          filter: "blur(28px)",
        }}
      />
    </div>
  );
}
