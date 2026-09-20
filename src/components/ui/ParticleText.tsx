// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Text that assembles itself out of particles, then stays alive: it drifts
 * gently at rest and scatters away from the pointer.
 *
 * How it works: the string is drawn once to an offscreen canvas, the bitmap
 * is sampled on a fixed lattice, and every opaque sample becomes a particle
 * with a scattered start position. Each frame integrates three forces —
 * a spring home, the pointer's repulsion, and an idle drift — so the
 * wordmark reads as a held shape rather than a finished image.
 *
 * Unlike the first version this loop does NOT stop once the particles
 * arrive. It cannot: the pointer can arrive at any time, and a loop that
 * parked itself after the entrance had no way to notice. It is still cheap —
 * one fill per particle, no allocation per frame.
 *
 * Accessibility: the canvas is `aria-hidden` and the real text ships beside
 * it in a visually-hidden span, so the heading is still a heading to a
 * screen reader and still selectable by find-in-page. Under
 * `prefers-reduced-motion` the particles are placed at their targets on
 * frame one, the drift is off, and the pointer does not move them.
 */

import { runRafLoopWhileVisible } from "@/components/ui/backgrounds/rafLoop";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

type Particle = {
  /** Live position. */
  x: number;
  y: number;
  /** Where the glyph wants it. */
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  /** ms into the entrance before this one starts moving. */
  delay: number;
  /** Phase offsets so idle drift is not in lockstep across the field. */
  px: number;
  py: number;
  /** 0..1 proximity to the pointer on the last frame, for the highlight. */
  heat: number;
};

/** Spring pulling a particle home. Paired with DAMPING for a soft landing. */
const STIFFNESS = 42;
const DAMPING = 9;
/** rAF deltas are clamped so a hidden tab cannot explode the integrator. */
const MAX_DT = 1 / 30;
/** Idle drift cycles per second. */
const DRIFT_HZ = 0.22;

type Props = {
  text: string;
  /** Resting particle colour. */
  color?: string;
  /** Colour particles take as the pointer pushes them. */
  highlight?: string;
  /** Rendered cap height in CSS pixels. */
  fontSize?: number;
  fontWeight?: number;
  /** Radius of one particle, in CSS pixels. */
  particleSize?: number;
  /** Lattice pitch in device pixels. Lower is denser and more expensive. */
  density?: number;
  /** How far particles start from home, in CSS pixels. */
  scatter?: number;
  /** Entrance duration, in ms — how long the last particle has to settle. */
  gather?: number;
  /** Spread of per-particle entrance delays, in ms. */
  stagger?: number;
  /** How hard the pointer pushes. */
  repelStrength?: number;
  /** Pointer influence radius, in CSS pixels. */
  repelRadius?: number;
  /** Amplitude of the resting drift, in CSS pixels. */
  idleDrift?: number;
  /** Soft bloom around each particle. Costs a shadow per fill. */
  glow?: boolean;
  className?: string;
};

export function ParticleText({
  text,
  color = "#f8fafc",
  highlight = "#8b5cf6",
  fontSize = 64,
  fontWeight = 800,
  particleSize = 2.2,
  density = 4,
  scatter = 190,
  gather = 1600,
  stagger = 420,
  repelStrength = 42,
  repelRadius = 120,
  idleDrift = 0.8,
  glow = true,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const family = getComputedStyle(canvas).fontFamily || "sans-serif";
    const font = `${fontWeight} ${fontSize * dpr}px ${family}`;

    // Measure first so the canvas is exactly as wide as the text plus the
    // scatter margin — particles start outside the glyph bounds, and a box
    // sized to the glyphs alone would clip the entrance.
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const margin = Math.max(scatter * 0.5, 24);
    const wCss = Math.ceil(metrics.width / dpr) + margin * 2;
    const hCss = Math.ceil(fontSize * 1.6) + margin * 2;

    canvas.width = Math.max(1, Math.round(wCss * dpr));
    canvas.height = Math.max(1, Math.round(hCss * dpr));
    canvas.style.width = `${wCss}px`;
    canvas.style.height = `${hCss}px`;

    // Draw the text, sample it, then clear: the bitmap is a source of
    // coordinates, never something that gets shown.
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(text, margin * dpr, canvas.height / 2);

    const bitmap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const step = Math.max(1, Math.round(density));
    const particles: Particle[] = [];
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        // Alpha channel of this sample. Anything mostly-opaque is ink.
        if (bitmap.data[(y * canvas.width + x) * 4 + 3] < 128) continue;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * scatter * dpr;
        particles.push({
          x: reduceMotion ? x : x + Math.cos(angle) * dist,
          y: reduceMotion ? y : y + Math.sin(angle) * dist,
          tx: x,
          ty: y,
          vx: 0,
          vy: 0,
          delay: reduceMotion ? 0 : Math.random() * stagger,
          px: Math.random() * Math.PI * 2,
          py: Math.random() * Math.PI * 2,
          heat: 0,
        });
      }
    }

    // Pointer is tracked in canvas device pixels, read once per frame. The
    // canvas is `pointer-events: none`, so this listens on the window and
    // converts — otherwise the wordmark would only react when the pointer
    // was literally over the glyphs, which is not what "reacts to the
    // cursor" means for a piece of scenery.
    let pointerX = Number.NEGATIVE_INFINITY;
    let pointerY = Number.NEGATIVE_INFINITY;
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = (e.clientX - rect.left) * dpr;
      pointerY = (e.clientY - rect.top) * dpr;
    };
    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    const radius = particleSize * dpr;
    const repelR = repelRadius * dpr;
    const repelRSq = repelR * repelR;
    const drift = idleDrift * dpr;

    // The entrance eases the spring in over `gather`, so the field arrives
    // together instead of the nearest particles snapping home instantly.
    let elapsed = 0;
    let lastT = 0;

    const stopLoop = runRafLoopWhileVisible((t) => {
      const dt = lastT === 0 ? 1 / 60 : Math.min((t - lastT) / 1000, MAX_DT);
      lastT = t;
      elapsed += dt * 1000;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (glow) {
        ctx.shadowBlur = radius * 3;
      } else {
        ctx.shadowBlur = 0;
      }

      for (const p of particles) {
        if (elapsed < p.delay) continue;

        // Entrance ramp: 0 at the particle's start, 1 once `gather` has
        // passed. Squared so it accelerates rather than lurching.
        const intro = Math.min(1, (elapsed - p.delay) / Math.max(1, gather));
        const k = STIFFNESS * (0.25 + intro * intro * 0.75);

        // Idle drift — a slow figure-of-eight around home, so the wordmark
        // is never perfectly static without ever losing its shape.
        const dx0 = reduceMotion
          ? 0
          : Math.sin(elapsed / 1000 * DRIFT_HZ * Math.PI * 2 + p.px) * drift;
        const dy0 = reduceMotion
          ? 0
          : Math.cos(elapsed / 1000 * DRIFT_HZ * Math.PI * 2 + p.py) * drift;

        let ax = (p.tx + dx0 - p.x) * k;
        let ay = (p.ty + dy0 - p.y) * k;

        // Pointer repulsion. Falls off quadratically, so the edge of the
        // radius is a nudge and the centre is a shove.
        let heat = 0;
        if (pointerX !== Number.NEGATIVE_INFINITY) {
          const rx = p.x - pointerX;
          const ry = p.y - pointerY;
          const dSq = rx * rx + ry * ry;
          if (dSq < repelRSq && dSq > 0.0001) {
            const d = Math.sqrt(dSq);
            const falloff = 1 - d / repelR;
            heat = falloff;
            const push = repelStrength * falloff * falloff * 60;
            ax += (rx / d) * push;
            ay += (ry / d) * push;
          }
        }
        // Heat decays rather than snapping, so the highlight trails the
        // pointer out instead of blinking off behind it.
        p.heat = Math.max(heat, p.heat - dt * 2.4);

        p.vx = (p.vx + ax * dt) * Math.exp(-DAMPING * dt);
        p.vy = (p.vy + ay * dt) * Math.exp(-DAMPING * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const fill = p.heat > 0.02 ? mix(color, highlight, p.heat) : color;
        ctx.fillStyle = fill;
        if (glow) ctx.shadowColor = fill;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    });

    return () => {
      stopLoop();
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [
    text,
    color,
    highlight,
    fontSize,
    fontWeight,
    particleSize,
    density,
    scatter,
    gather,
    stagger,
    repelStrength,
    repelRadius,
    idleDrift,
    glow,
  ]);

  return (
    <span className={cn("relative inline-block align-middle", className)}>
      <canvas ref={canvasRef} aria-hidden className="block" />
      {/* The accessible copy. Clipped to a 1px box rather than
          `display:none`, which would take it out of the a11y tree too. */}
      <span className="absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]">
        {text}
      </span>
    </span>
  );
}

/** Blend two hex colours. `t` 0 = `a`, 1 = `b`. */
function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
