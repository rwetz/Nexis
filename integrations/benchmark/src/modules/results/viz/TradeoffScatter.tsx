import { useMemo } from "react";
import { BACKEND_COLOR, BACKEND_SHORT } from "@/lib/backendMeta";
import { formatCompact, formatMs } from "@/lib/utils";
import { type BenchResult, type ModelInfo } from "@/lib/types";

interface Pt {
  x: number; // mean latency (ms) — lower is better
  y: number; // throughput (tok/s) — higher is better
  backendId: BenchResult["backendId"];
  name: string;
  frontier: boolean;
}

const W = 760;
const H = 400;
const M = { l: 60, r: 20, t: 18, b: 44 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

const log10 = (v: number) => Math.log10(Math.max(v, 1e-9));

/**
 * Throughput vs latency, log–log. The Pareto frontier (non-dominated points:
 * nothing is both faster *and* higher-throughput) is highlighted — the ideal
 * sits top-left.
 */
export function TradeoffScatter({
  results,
  models,
}: {
  results: BenchResult[];
  models: ModelInfo[];
}) {
  const pts = useMemo<Pt[]>(() => {
    const base = results
      .filter((r) => r.status === "done" && r.metrics && r.metrics.latencyMeanMs > 0)
      .map((r) => ({
        x: r.metrics!.latencyMeanMs,
        y: r.metrics!.tokensPerSec,
        backendId: r.backendId,
        name: models.find((m) => m.id === r.modelId)?.name ?? r.modelId,
        frontier: false,
      }));
    // Pareto: a point is dominated if another is ≤ latency and ≥ throughput.
    for (const p of base) {
      p.frontier = !base.some(
        (o) => o !== p && o.x <= p.x && o.y >= p.y && (o.x < p.x || o.y > p.y),
      );
    }
    return base;
  }, [results, models]);

  if (pts.length === 0) {
    return (
      <div className="grid place-items-center py-10 text-sm text-muted-foreground">
        Run a benchmark to map throughput against latency.
      </div>
    );
  }

  const xs = pts.map((p) => log10(p.x));
  const ys = pts.map((p) => log10(p.y));
  const dom = (arr: number[]): [number, number] => {
    let lo = Math.min(...arr);
    let hi = Math.max(...arr);
    if (hi - lo < 1e-6) {
      lo -= 0.5;
      hi += 0.5;
    } else {
      const pad = (hi - lo) * 0.12;
      lo -= pad;
      hi += pad;
    }
    return [lo, hi];
  };
  const [xlo, xhi] = dom(xs);
  const [ylo, yhi] = dom(ys);
  const sx = (v: number) => M.l + ((log10(v) - xlo) / (xhi - xlo)) * PW;
  const sy = (v: number) => M.t + PH - ((log10(v) - ylo) / (yhi - ylo)) * PH;

  const ticks = (lo: number, hi: number) =>
    Array.from({ length: 4 }, (_, i) => 10 ** (lo + ((hi - lo) * i) / 3));
  const xticks = ticks(xlo, xhi);
  const yticks = ticks(ylo, yhi);

  const frontierPath = pts
    .filter((p) => p.frontier)
    .sort((a, b) => a.x - b.x)
    .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Throughput vs latency">
      {/* grid */}
      {xticks.map((t, i) => (
        <g key={`x${i}`}>
          <line x1={sx(t)} y1={M.t} x2={sx(t)} y2={M.t + PH} className="stroke-border/50" strokeWidth={1} />
          <text x={sx(t)} y={M.t + PH + 18} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
            {formatMs(t)}
          </text>
        </g>
      ))}
      {yticks.map((t, i) => (
        <g key={`y${i}`}>
          <line x1={M.l} y1={sy(t)} x2={M.l + PW} y2={sy(t)} className="stroke-border/50" strokeWidth={1} />
          <text x={M.l - 8} y={sy(t) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
            {formatCompact(t)}
          </text>
        </g>
      ))}

      {/* axis hints */}
      <text x={M.l + PW} y={H - 6} textAnchor="end" className="fill-muted-foreground/70 text-[10px]">
        latency → slower
      </text>
      <text
        x={14}
        y={M.t + PH / 2}
        textAnchor="middle"
        className="fill-muted-foreground/70 text-[10px]"
        transform={`rotate(-90 14 ${M.t + PH / 2})`}
      >
        throughput → higher
      </text>

      {/* frontier */}
      {frontierPath && (
        <path
          d={frontierPath}
          fill="none"
          className="stroke-brand"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinejoin="round"
          opacity={0.7}
        />
      )}

      {/* points */}
      {pts.map((p, i) => {
        const cx = sx(p.x);
        const cy = sy(p.y);
        const c = BACKEND_COLOR[p.backendId];
        return (
          <g key={i}>
            <title>
              {p.name} · {BACKEND_SHORT[p.backendId]}
              {"\n"}
              {formatCompact(p.y)} tok/s @ {formatMs(p.x)}
              {p.frontier ? "\n★ on the efficiency frontier" : ""}
            </title>
            {p.frontier && <circle cx={cx} cy={cy} r={10} fill={c} opacity={0.18} />}
            <circle
              cx={cx}
              cy={cy}
              r={p.frontier ? 6 : 4.5}
              fill={c}
              className="stroke-card"
              strokeWidth={1.5}
            />
            <text x={cx} y={cy - 11} textAnchor="middle" className="fill-muted-foreground font-mono text-[9.5px]">
              {BACKEND_SHORT[p.backendId]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
