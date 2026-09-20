// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Text that assembles itself out of particles, then holds.
 *
 * How it works: the string is drawn once to an offscreen canvas, the bitmap
 * is sampled on a fixed lattice, and every opaque sample becomes a particle
 * with a random start position. Each frame eases particles toward their
 * targets; once they all arrive the loop stops rewriting anything and the
 * result is a still image. It is an entrance, not an ambient animation —
 * a wordmark that never settles is a wordmark you cannot read.
 *
 * Accessibility: the canvas is `aria-hidden` and the real text ships beside
 * it in a visually-hidden span, so the heading is still a heading to a
 * screen reader and still selectable by find-in-page. Under
 * `prefers-reduced-motion` the particles are placed at their targets on
 * frame one — same picture, no assembly.
 */

import { runRafLoopWhileVisible } from "@/components/ui/backgrounds/rafLoop";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

/** Lattice pitch, in device pixels. Smaller is denser and more expensive. */
const SAMPLE_STEP = 3;
/** Fraction of remaining distance covered per frame. */
const EASE = 0.08;
/** Below this, a particle is snapped home and dropped from the update set. */
const ARRIVE_PX = 0.35;
/** Radius of one particle, in device pixels. */
const PARTICLE_R = 1.1;

type Particle = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  done: boolean;
};

type Props = {
  text: string;
  /** Particle colour. Defaults to the current text colour. */
  color?: string;
  /** Rendered font size in CSS pixels. */
  fontSize?: number;
  fontWeight?: number;
  className?: string;
};

export function ParticleText({
  text,
  color,
  fontSize = 22,
  fontWeight = 600,
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
    // Resolve the colour from the element itself when none was given, so the
    // wordmark inherits the theme like ordinary text would.
    const paint =
      color ?? getComputedStyle(canvas).color ?? "#ffffff";
    const font = `${fontWeight} ${fontSize * dpr}px ${
      getComputedStyle(canvas).fontFamily || "sans-serif"
    }`;

    // Measure first so the canvas is exactly as wide as the text, rather
    // than a guessed box that clips descenders or leaves dead space.
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const wCss = Math.ceil(metrics.width / dpr) + 8;
    const hCss = Math.ceil(fontSize * 1.5);

    canvas.width = Math.max(1, Math.round(wCss * dpr));
    canvas.height = Math.max(1, Math.round(hCss * dpr));
    canvas.style.width = `${wCss}px`;
    canvas.style.height = `${hCss}px`;

    // Draw the text, sample it, then clear: the bitmap is a source of
    // coordinates, never something that gets shown.
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(text, 4 * dpr, canvas.height / 2);

    const bitmap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const particles: Particle[] = [];
    for (let y = 0; y < canvas.height; y += SAMPLE_STEP) {
      for (let x = 0; x < canvas.width; x += SAMPLE_STEP) {
        // Alpha channel of this sample. Anything mostly-opaque is ink.
        const alpha = bitmap.data[(y * canvas.width + x) * 4 + 3];
        if (alpha < 128) continue;
        particles.push(
          reduceMotion
            ? { x, y, tx: x, ty: y, done: true }
            : {
                // Start scattered across the box, so the assembly reads as
                // a gathering rather than as a wipe from one edge.
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                tx: x,
                ty: y,
                done: false,
              },
        );
      }
    }

    ctx.fillStyle = paint;
    let pending = particles.filter((p) => !p.done).length;
    let settledFrames = 0;

    const stopLoop = runRafLoopWhileVisible(() => {
      // Once everything has arrived, draw one last time and stop touching
      // the canvas — the finished wordmark is a static image.
      if (pending === 0 && settledFrames > 1) return;

      if (pending > 0) {
        pending = 0;
        for (const p of particles) {
          if (p.done) continue;
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          if (Math.abs(dx) < ARRIVE_PX && Math.abs(dy) < ARRIVE_PX) {
            p.x = p.tx;
            p.y = p.ty;
            p.done = true;
            continue;
          }
          p.x += dx * EASE;
          p.y += dy * EASE;
          pending++;
        }
      } else {
        settledFrames++;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, PARTICLE_R * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    return stopLoop;
  }, [text, color, fontSize, fontWeight]);

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
