import { cn } from "@/lib/utils";

/**
 * Strip plot of per-run latency samples on the cell's own min–max scale.
 * Reveals consistency (tight cluster) vs jitter (spread) and marks p50 / p95 —
 * data we collect but never showed before.
 */
export function DistributionStrip({
  samples,
  color,
  className,
}: {
  samples: number[];
  color: string;
  className?: string;
}) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span = max - min || 1;
  const pct = (v: number) => (max === min ? 50 : ((v - min) / span) * 100);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const p50 = q(0.5);
  const p95 = q(0.95);

  return (
    <div className={cn("relative h-4 w-full", className)} title={`${samples.length} runs · p50/p95 marked`}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
      {/* min–max range */}
      <div
        className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
        style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%`, background: color, opacity: 0.22 }}
      />
      {/* sample dots */}
      {samples.map((s, i) => (
        <span
          key={i}
          className="absolute top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${pct(s)}%`, background: color, opacity: 0.5 }}
        />
      ))}
      {/* p50 (solid tick) + p95 (faint tick) */}
      <span
        className="absolute top-1/2 h-3.5 w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${pct(p50)}%`, background: color }}
      />
      <span
        className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55"
        style={{ left: `${pct(p95)}%`, background: color }}
      />
    </div>
  );
}
