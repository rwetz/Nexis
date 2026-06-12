// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * MetricChart — a canvas line chart for one metric series, labeled in
 * plain language (see lib/friendly.ts). `hero` renders the headline
 * metric bigger, with its explanation underneath.
 *
 * Subscribes to the primitive `seriesTick` counter (pitfall #14: never a
 * derived array) and reads the module-level series buffer imperatively.
 * Rendering decimates to ~2 points per pixel via min/max binning, so a
 * 100k-step series stays cheap and spikes stay visible.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useMlStore, getSeriesMap } from "./store";
import { binForRender } from "./lib/series";
import { displayMetric } from "./lib/friendly";

function cssColor(el: HTMLElement, varName: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(varName).trim();
  return v || fallback;
}

export function MetricChart({
  name,
  hero = false,
}: {
  name: string;
  hero?: boolean;
}) {
  const tick = useMlStore((s) => s.seriesTick);
  const lastValues = useMlStore((s) => s.lastValues);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const height = hero ? 132 : 68;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const width = wrap.clientWidth;
      if (width <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const series = getSeriesMap().get(name);
      if (!series || series.steps.length === 0) return;

      const line = cssColor(canvas, "--chart-2", "#888");
      const grid = cssColor(canvas, "--border", "#3333");
      const padX = 4;
      const padY = 8;
      const plotW = width - padX * 2;
      const plotH = height - padY * 2;

      const view = binForRender(series, Math.max(16, Math.floor(plotW / 2)));
      const n = view.steps.length;
      const minStep = view.steps[0];
      const maxStep = view.steps[n - 1];
      let minV = Infinity;
      let maxV = -Infinity;
      for (const v of view.values) {
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      if (minV === maxV) {
        minV -= 0.5;
        maxV += 0.5;
      }
      const spanStep = Math.max(maxStep - minStep, 1);
      const spanV = maxV - minV;

      const xOf = (step: number) => padX + ((step - minStep) / spanStep) * plotW;
      const yOf = (v: number) => padY + (1 - (v - minV) / spanV) * plotH;

      // light midline grid
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, height / 2);
      ctx.lineTo(width - padX, height / 2);
      ctx.stroke();

      // soft area fill under the line (the "spectacle" part)
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = xOf(view.steps[i]);
        const y = yOf(view.values[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const lastX = xOf(view.steps[n - 1]);
      ctx.save();
      ctx.lineTo(lastX, height - padY);
      ctx.lineTo(xOf(view.steps[0]), height - padY);
      ctx.closePath();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = line;
      ctx.fill();
      ctx.restore();

      // the line itself
      ctx.strokeStyle = line;
      ctx.lineWidth = hero ? 2 : 1.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = xOf(view.steps[i]);
        const y = yOf(view.values[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // dot on the latest point
      ctx.fillStyle = line;
      ctx.beginPath();
      ctx.arc(lastX, yOf(view.values[n - 1]), hero ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [name, tick, hero, height]);

  const display = displayMetric(name);
  const last = lastValues[name];

  return (
    <div ref={wrapRef} className="w-full">
      <div className="mb-0.5 flex items-baseline justify-between px-0.5">
        <span
          className={cn(
            "truncate text-muted-foreground",
            hero ? "text-[11px] font-medium" : "text-[10px]",
          )}
          title={name}
        >
          {display.label}
        </span>
        {typeof last === "number" ? (
          <span
            className={cn(
              "font-mono tabular-nums text-foreground/90",
              hero ? "text-[15px] font-semibold" : "text-[10px]",
            )}
          >
            {display.format(last)}
          </span>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        height={height}
        className="w-full rounded-sm bg-muted/30"
      />
      {hero && display.hint ? (
        <p className="mt-0.5 px-0.5 text-[10px] leading-snug text-muted-foreground/70">
          {display.hint}
        </p>
      ) : null}
    </div>
  );
}
