// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A grid of dots that lights up around the pointer and takes a shockwave
 * when the pointer moves fast.
 *
 * Canvas 2D rather than WebGL: this one is cheap enough to draw on the CPU,
 * and keeping it off the GL path means it is the background that still runs
 * on a machine with no working WebGL context.
 *
 * The reference implementation drives the shock with GSAP's InertiaPlugin.
 * The integrator below replaces it — a damped spring per dot, eight lines —
 * so the app does not take on a new animation runtime, and its separate
 * licence, for one background. Dots at rest are skipped entirely, so an idle
 * grid costs one fill per dot and no physics at all.
 */

import { useEffect, useRef } from "react";
import { runRafLoopWhileVisible } from "./rafLoop";

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

type Dot = {
  /** 0..1 along the grid diagonal, for the rainbow ramp. */
  t: number;
  /** Grid position, in CSS pixels, of the dot's rest point. */
  cx: number;
  cy: number;
  /** Displacement from the rest point, and its velocity. */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
};

/** Spring constants for the shock recoil. Tuned to settle in about a second. */
const STIFFNESS = 90;
const DAMPING = 11;
/** Below this, a dot is snapped to rest and dropped from the physics pass. */
const REST_EPSILON = 0.01;
/** rAF deltas are clamped so a backgrounded tab cannot explode the spring. */
const MAX_DT = 1 / 30;

type Props = {
  /** Dot colour at rest, and under the pointer. */
  baseColor?: string;
  activeColor?: string;
  /** Dot diameter and centre-to-centre spacing, in CSS pixels. */
  dotSize?: number;
  gap?: number;
  /** Radius of the pointer's influence, in CSS pixels. */
  proximity?: number;
  /** Pointer speed, in px/s, above which a shockwave fires. */
  speedTrigger?: number;
  shockRadius?: number;
  shockStrength?: number;
  /** Seven-stop spectrum. When given, each dot takes its resting colour from
   *  its position in the grid rather than from `baseColor`, so the lattice
   *  reads as the rainbow accent rather than as one tinted field. */
  rainbow?: string[];
  opacity?: number;
};

export function DotGridBackground({
  baseColor = "#2A2A38",
  activeColor = "#5227FF",
  dotSize = 4,
  gap = 28,
  proximity = 140,
  speedTrigger = 100,
  shockRadius = 240,
  shockStrength = 22,
  rainbow,
  opacity = 0.5,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      container.removeChild(canvas);
      return;
    }

    const base = hexToRgb(baseColor);
    const active = hexToRgb(activeColor);
    // Resolved once: a per-dot hex parse every frame would be the most
    // expensive thing in the loop.
    const ramp = rainbow?.length ? rainbow.map(hexToRgb) : null;

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    /** Dots currently displaced, so an idle grid does no physics work. */
    let moving = new Set<Dot>();

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = container.clientWidth;
      height = container.clientHeight;
      // Lazily imported, so the first measure can land before layout. The
      // ResizeObserver below re-runs this the moment the box has a size.
      if (width === 0 || height === 0) return;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pitch = dotSize + gap;
      const cols = Math.max(1, Math.floor((width + gap) / pitch));
      const rows = Math.max(1, Math.floor((height + gap) / pitch));
      // Centre the grid so the margins match on both sides, instead of
      // leaving the whole remainder against one edge.
      const startX = (width - (cols * pitch - gap)) / 2 + dotSize / 2;
      const startY = (height - (rows * pitch - gap)) / 2 + dotSize / 2;

      dots = [];
      moving = new Set();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          dots.push({
            // Diagonal position, 0..1, so a spectrum sweeps corner to corner
            // rather than banding down one axis.
            t: (col / Math.max(1, cols - 1) + row / Math.max(1, rows - 1)) / 2,
            cx: startX + col * pitch,
            cy: startY + row * pitch,
            ox: 0,
            oy: 0,
            vx: 0,
            vy: 0,
          });
        }
      }
    };

    // Pointer state lives in the closure and is read once per frame. Doing
    // the tint work in the pointermove handler instead would run it at the
    // input device's rate, which on a high-polling-rate mouse is several
    // times the frame rate for no visible gain.
    let pointerX = Number.NEGATIVE_INFINITY;
    let pointerY = Number.NEGATIVE_INFINITY;
    let lastX = 0;
    let lastY = 0;
    let lastMoveT = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = performance.now();
      const elapsed = Math.max(1, now - lastMoveT);
      const speed = Math.hypot(x - lastX, y - lastY) / (elapsed / 1000);

      if (lastMoveT !== 0 && speed > speedTrigger) {
        for (const dot of dots) {
          const dx = dot.cx - x;
          const dy = dot.cy - y;
          const dist = Math.hypot(dx, dy);
          if (dist >= shockRadius || dist === 0) continue;
          // Impulse falls off linearly and pushes away from the pointer.
          const impulse = shockStrength * (1 - dist / shockRadius) * 10;
          dot.vx += (dx / dist) * impulse;
          dot.vy += (dy / dist) * impulse;
          moving.add(dot);
        }
      }

      pointerX = x;
      pointerY = y;
      lastX = x;
      lastY = y;
      lastMoveT = now;
    };

    const onPointerLeave = () => {
      pointerX = Number.NEGATIVE_INFINITY;
      pointerY = Number.NEGATIVE_INFINITY;
    };

    const advance = (dt: number) => {
      if (moving.size === 0) return;
      for (const dot of moving) {
        // Damped spring back to the rest point.
        dot.vx += (-STIFFNESS * dot.ox - DAMPING * dot.vx) * dt;
        dot.vy += (-STIFFNESS * dot.oy - DAMPING * dot.vy) * dt;
        dot.ox += dot.vx * dt;
        dot.oy += dot.vy * dt;
        if (
          Math.abs(dot.ox) < REST_EPSILON &&
          Math.abs(dot.oy) < REST_EPSILON &&
          Math.abs(dot.vx) < REST_EPSILON &&
          Math.abs(dot.vy) < REST_EPSILON
        ) {
          dot.ox = 0;
          dot.oy = 0;
          dot.vx = 0;
          dot.vy = 0;
          moving.delete(dot);
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const radius = dotSize / 2;
      const proxSq = proximity * proximity;
      for (const dot of dots) {
        const x = dot.cx + dot.ox;
        const y = dot.cy + dot.oy;

        // Proximity tint. The squared compare avoids a sqrt for every dot
        // outside the radius, which is nearly all of them.
        let t = 0;
        if (pointerX !== Number.NEGATIVE_INFINITY) {
          const dx = x - pointerX;
          const dy = y - pointerY;
          const dSq = dx * dx + dy * dy;
          if (dSq < proxSq) t = 1 - Math.sqrt(dSq) / proximity;
        }

        // Resting colour: a stop from the spectrum when one was given,
        // otherwise the flat base tone.
        let rest = base;
        if (ramp) {
          const pos = dot.t * (ramp.length - 1);
          const i = Math.min(ramp.length - 2, Math.floor(pos));
          const f = pos - i;
          const a = ramp[i];
          const bb = ramp[i + 1];
          rest = {
            r: a.r + (bb.r - a.r) * f,
            g: a.g + (bb.g - a.g) * f,
            b: a.b + (bb.b - a.b) * f,
          };
        }
        const r = Math.round(rest.r + (active.r - rest.r) * t);
        const g = Math.round(rest.g + (active.g - rest.g) * t);
        const b = Math.round(rest.b + (active.b - rest.b) * t);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    build();

    const observer = new ResizeObserver(build);
    observer.observe(container);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);

    let lastT = 0;
    const stopLoop = runRafLoopWhileVisible((t) => {
      // rAF timestamps jump across a visibility pause; clamp so the spring
      // integrates a plausible step rather than one enormous one.
      const dt = lastT === 0 ? 1 / 60 : Math.min((t - lastT) / 1000, MAX_DT);
      lastT = t;
      advance(dt);
      draw();
    });

    return () => {
      stopLoop();
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [
    baseColor,
    activeColor,
    dotSize,
    gap,
    proximity,
    speedTrigger,
    shockRadius,
    shockStrength,
    rainbow,
  ]);

  return (
    <div
      aria-hidden
      ref={containerRef}
      // `absolute`, not `fixed`: this fills the welcome screen, which is a
      // pane inside the layout, not an overlay across the window. Matches
      // DarkVeil, the background it sits beside in the rotation.
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity,
        transition: "opacity 200ms ease-out",
      }}
    />
  );
}
