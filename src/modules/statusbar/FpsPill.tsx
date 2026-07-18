// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Stats = {
  /** Frames observed in the last rolling second. */
  fps: number;
  /** Mean frame-to-frame delta over the 5 s window, ms. */
  avgMs: number;
  /** Worst single frame delta over the 5 s window, ms — the jank spikes. */
  worstMs: number;
};

/** Ignore deltas above this — the tab was hidden / the app was suspended,
 * not a real frame. rAF stops entirely while hidden, so a giant delta on
 * resume would otherwise register as a monster jank spike. */
const HIDDEN_GAP_MS = 1000;
/** Push a state update at most this often; the rAF loop itself must stay
 * allocation-light so the meter doesn't distort what it measures. */
const DISPLAY_UPDATE_MS = 500;
const WINDOW_MS = 5000;

/**
 * Opt-in FPS meter (Settings → General → Debug → "FPS meter"), in the spirit
 * of Zed's frame-rate readout. Measures via requestAnimationFrame: rAF fires
 * every vsync while the main thread keeps up, so missed ticks are exactly
 * main-thread jank — long tasks, layout storms, slow renders. It does NOT
 * see GPU/compositor stalls that never block the main thread. Costs nothing
 * while off (not mounted, no rAF loop).
 */
export function FpsPill() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastUpdate = 0;
    // Ring of {timestamp, delta} pairs pruned to the 5 s window.
    const times: number[] = [];
    const deltas: number[] = [];

    const loop = (now: number) => {
      const delta = now - last;
      last = now;
      if (delta > 0 && delta < HIDDEN_GAP_MS) {
        times.push(now);
        deltas.push(delta);
      }
      while (times.length > 0 && times[0] < now - WINDOW_MS) {
        times.shift();
        deltas.shift();
      }
      if (now - lastUpdate >= DISPLAY_UPDATE_MS && deltas.length > 0) {
        lastUpdate = now;
        let fps = 0;
        let sum = 0;
        let worst = 0;
        for (let i = 0; i < times.length; i++) {
          if (times[i] >= now - 1000) fps++;
          sum += deltas[i];
          if (deltas[i] > worst) worst = deltas[i];
        }
        setStats({ fps, avgMs: sum / deltas.length, worstMs: worst });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!stats) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "shrink-0 cursor-default rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
            stats.fps < 30 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {stats.fps} fps
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-[11px] leading-relaxed">
        <div>frame time: {stats.avgMs.toFixed(1)} ms avg</div>
        <div>worst frame: {Math.round(stats.worstMs)} ms (last 5 s)</div>
        <div className="text-muted-foreground">
          rAF-based — measures main-thread jank, not GPU stalls
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
